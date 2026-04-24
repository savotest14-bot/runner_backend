const authorize = (permission) => {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const roleName = String(req.user.role.name || "").trim();

    if (roleName === "superAdmin") {
      return next();
    }

    const userPermissions = (req.user.role.permissions || []).map(p =>
      String(p).trim().toLowerCase()
    );
    // console.log("userPermissions",userPermissions)
    const requiredPermission = String(permission).trim().toLowerCase();
    // console.log("requiredPermission",requiredPermission)
    if (!userPermissions.includes(requiredPermission)) {
      return res.status(403).json({
        message: "You do not have permission to access this route",
      });
    }

    next();
  };
};

module.exports = authorize;
