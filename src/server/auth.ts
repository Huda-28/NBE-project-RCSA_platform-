import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { Request, Response, NextFunction } from 'express';
import { db } from './db.js';
import { User, UserBURole } from '../types/index.js';

/**
 * Secure JWT secret loader with fail-secure production policy.
 */
export function getJwtSecret(): string {
  const secret = process.env.RCSA_SECRET || process.env.JWT_SECRET;
  
  if (process.env.NODE_ENV === 'production') {
    if (!secret || secret === 'nbe-rcsa-dev-secret-key-2026' || secret.includes('change-me')) {
      throw new Error(
        '[FATAL SECURITY] Production mode requires a cryptographically strong RCSA_SECRET or JWT_SECRET environment variable.'
      );
    }
    return secret;
  }

  // Development fallback with explicit advisory
  if (!secret) {
    return 'nbe-rcsa-dev-secret-key-2026-development-only';
  }
  return secret;
}

export interface AuthenticatedRequest extends Request {
  user?: User;
}

export function getUserWithRoles(employeeId: string): User | null {
  const userRow = db.prepare(`
    SELECT employee_id, full_name, email, password_hash, must_reset_password, is_active, created_at
    FROM users WHERE employee_id = ?
  `).get(employeeId) as any;

  if (!userRow || !userRow.is_active) {
    return null;
  }

  const roleRows = db.prepare(`
    SELECT r.id, r.user_id, r.unit_id, r.role, r.granted_at, r.granted_by, b.name_ar as unit_name_ar
    FROM user_bu_roles r
    JOIN business_units b ON r.unit_id = b.id
    WHERE r.user_id = ?
  `).all(employeeId) as UserBURole[];

  return {
    employee_id: userRow.employee_id,
    full_name: userRow.full_name,
    email: userRow.email,
    must_reset_password: Boolean(userRow.must_reset_password),
    is_active: Boolean(userRow.is_active),
    created_at: userRow.created_at,
    roles: roleRows,
  };
}

export function generateToken(user: User): string {
  const secret = getJwtSecret();
  return jwt.sign(
    {
      sub: user.employee_id,
      name: user.full_name,
      must_reset: user.must_reset_password,
    },
    secret,
    { expiresIn: '8h' }
  );
}

/**
 * Authentication middleware enforcing valid token and mandatory password reset gating.
 */
export function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'غير مصرح: يرجى تسجيل الدخول وإرفاق رمز المصادقة.' });
  }

  const token = authHeader.substring(7);
  try {
    const secret = getJwtSecret();
    const payload = jwt.verify(token, secret) as { sub: string; must_reset?: boolean };
    const user = getUserWithRoles(payload.sub);
    if (!user) {
      return res.status(401).json({ error: 'المستخدم غير موجود أو تم تعطيل حسابه.' });
    }

    req.user = user;

    // FIRST-LOGIN PASSWORD RESET ENFORCEMENT ON BACKEND:
    // If must_reset_password is true, reject any business operation except auth session and password reset!
    if (user.must_reset_password) {
      const allowedPaths = ['/auth/me', '/auth/reset-password', '/auth/logout'];
      const currentPath = req.path;
      const isAllowed = allowedPaths.some(p => currentPath.endsWith(p));

      if (!isAllowed) {
        return res.status(403).json({
          error: 'إجراء محظور رقابياً: يجب تغيير كلمة المرور المبدئية أولاً قبل الوصول لبيانات وعمليات النظام.',
          code: 'PASSWORD_RESET_REQUIRED'
        });
      }
    }

    next();
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'انتهت صلاحية جلسة العمل المصرفية، يرجى تسجيل الدخول مجدداً.' });
    }
    return res.status(401).json({ error: 'رمز الجلسة غير صالح أو تم التلاعب به.' });
  }
}

/**
 * Check if user is authorized for a specific Business Unit.
 */
export function isUserAuthorizedForBU(user: User, unitId: string, allowedRoles?: string[]): boolean {
  // Central Risk Admin has universal oversight across all units
  if (user.roles.some(r => r.role === 'RISK_ADMIN')) {
    return true;
  }

  // Read-only, unscoped lookups are available across units to central auditors;
  // every mutating service must continue passing its explicit allowedRoles.
  if (!allowedRoles && user.roles.some(r => r.role === 'AUDITOR')) {
    return true;
  }

  // Central Auditor has read oversight
  if (allowedRoles && allowedRoles.includes('AUDITOR') && user.roles.some(r => r.role === 'AUDITOR')) {
    return true;
  }

  const expandedAllowed = new Set<string>(allowedRoles || []);
  if (expandedAllowed.has('MAKER') || expandedAllowed.has('BU_MAKER')) {
    expandedAllowed.add('MAKER');
    expandedAllowed.add('BU_MAKER');
  }
  if (expandedAllowed.has('CHECKER') || expandedAllowed.has('BU_CHECKER')) {
    expandedAllowed.add('CHECKER');
    expandedAllowed.add('BU_CHECKER');
  }

  // Check specific unit permission
  return user.roles.some(r => {
    if (r.unit_id !== unitId) return false;
    if (!allowedRoles || allowedRoles.length === 0) return true;
    return expandedAllowed.has(r.role);
  });
}

/**
 * Server-side authorization guard enforcing Business Unit and Role boundaries.
 */
export function requireBURole(roles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'غير مصادق.' });
    }

    const unitId = req.params.unit_id || req.body.unit_id || req.query.unit_id;
    
    // Central Risk Admin oversight
    const isGlobalAdmin = req.user.roles.some(r => r.role === 'RISK_ADMIN');
    if (isGlobalAdmin) {
      return next();
    }

    // Central Auditor check if AUDITOR role is included
    if (roles.includes('AUDITOR') && req.user.roles.some(r => r.role === 'AUDITOR')) {
      return next();
    }

    if (!unitId) {
      const hasAnyRole = req.user.roles.some(r => roles.includes(r.role));
      if (!hasAnyRole) {
        return res.status(403).json({ error: 'غير مصرح: لا تملك الصلاحية المطلوبة لتنفيذ هذا الإجراء.' });
      }
      return next();
    }

    // Strict BU-specific check (Prevents horizontal cross-BU access)
    const hasRoleInUnit = isUserAuthorizedForBU(req.user, unitId, roles);
    if (!hasRoleInUnit) {
      return res.status(403).json({ 
        error: `غير مصرح: لا تملك صلاحية (${roles.join(' أو ')}) على هذه الوحدة التنظيمية (${unitId}).` 
      });
    }

    next();
  };
}

/**
 * Strict Server-Side Maker-Checker Approval Guard.
 * Prohibits self-approval: The user approving the assessment MUST NOT be the one who created it,
 * even if they possess multiple roles or admin permissions.
 */
export function canApproveAssessment(approver: User, assessmentId: string): { allowed: boolean; reason?: string } {
  const assessment = db.prepare(`
    SELECT id, unit_id, status, created_by FROM rcsa_assessments WHERE id = ?
  `).get(assessmentId) as { id: string; unit_id: string; status: string; created_by: string } | undefined;

  if (!assessment) {
    return { allowed: false, reason: 'التقييم المطلوب غير موجود.' };
  }

  if (assessment.status !== 'SUBMITTED') {
    return { allowed: false, reason: 'لا يمكن اعتماد التقييم: يجب أن يكون التقييم مقدماً للمراجعة (SUBMITTED) أولاً.' };
  }

  // STRICT SELF-APPROVAL PROHIBITION:
  // Regardless of roles or permissions, the creator cannot approve their own assessment!
  if (assessment.created_by === approver.employee_id) {
    return { 
      allowed: false, 
      reason: 'مخالفة رقابية صارمة لمبدأ الرقابة المزدوجة (Maker-Checker): يُمنع منعاً باتاً لمنشئ التقييم (Maker) اعتماده بنفسه.' 
    };
  }

  // Approver must have CHECKER role specifically on this unit or be central RISK_ADMIN
  const hasCheckerRole = approver.roles.some(
    r => (r.unit_id === assessment.unit_id && r.role === 'CHECKER') || r.role === 'RISK_ADMIN'
  );

  if (!hasCheckerRole) {
    return { allowed: false, reason: 'غير مصرح: يلزم توفر صلاحية مراجع معتمد (CHECKER) أو مدير المخاطر على هذه الوحدة التنظيمية.' };
  }

  return { allowed: true };
}
