const jwt = require("jsonwebtoken");
const User = require("../models/User");

module.exports = async (req, res, next) => {
  const token = req.header("Authorization")?.replace("Bearer ", "");

  if (!token) {
    return res.status(401).json({ msg: "No token, authorization denied" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const x = await User.findById(decoded.user.id).select("-password");
    req.user = await User.findById(decoded.user.id).select("-password");
    next();
  } catch (err) {
    console.error("Auth error:", err);
    res.status(401).json({ msg: "Token is not valid" });
  }
};
