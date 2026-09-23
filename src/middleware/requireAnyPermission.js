/*
 * Passes when the caller holds ANY of the listed permissions.
 *
 * Exists for GET /services/:id, which is read by lead-service and
 * customer-service — with the end user's own token — to resolve the service
 * names attached to a lead or customer. Requiring services.read there would
 * mean anyone who can read leads must also be handed the Services screen.
 *
 * Kept separate from requirePermission so that middleware stays identical
 * across all six services.
 */
function requireAnyPermission(...permissions) {
  return (req, res, next) => {
    if (!req.auth) {
      return res.status(401).json({
        error: "Authentication required",
      });
    }

    const held = permissions.some((permission) =>
      req.auth.permissions.includes(permission),
    );

    if (!held) {
      return res.status(403).json({
        error: "Insufficient permissions",
        requiredPermission: permissions.join(" or "),
      });
    }

    next();
  };
}

module.exports = requireAnyPermission;
