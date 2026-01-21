const authorize = (permission) => {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (req.user.role.name === "superAdmin") {
      return next();
    }

    if (!req.user.role.permissions.includes(permission)) {
      return res.status(403).json({ message: "You do not have permission to access this route" });
    }

    next();
  };
};

module.exports = authorize;
