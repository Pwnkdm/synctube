const { body, validationResult } = require("express-validator");

// Validation middleware
const validateRegistration = [
  body("username")
    .isLength({ min: 3, max: 30 })
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage(
      "Username must be 3-30 characters long and contain only letters, numbers, and underscores"
    ),

  body("email")
    .isEmail()
    .normalizeEmail()
    .withMessage("Please provide a valid email"),

  body("password")
    .isLength({ min: 6 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage(
      "Password must be at least 6 characters with at least one lowercase, uppercase, and number"
    ),

  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: "Validation failed",
        details: errors.array(),
      });
    }
    next();
  },
];

const validateLogin = [
  body("email").isEmail().normalizeEmail(),
  body("password").notEmpty(),

  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: "Invalid input",
        details: errors.array(),
      });
    }
    next();
  },
];

const validateRoom = [
  body("name")
    .isLength({ min: 3, max: 50 })
    .trim()
    .withMessage("Room name must be 3-50 characters long"),

  body("isPrivate").optional().isBoolean(),
  body("maxUsers").optional().isInt({ min: 2, max: 100 }),

  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: "Validation failed",
        details: errors.array(),
      });
    }
    next();
  },
];

module.exports = { validateRegistration, validateLogin, validateRoom };
