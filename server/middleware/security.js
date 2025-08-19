const helmet = require("helmet");
const morgan = require("morgan");
const compression = require("compression");

const securityMiddleware = [
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https:", "http:"],
        scriptSrc: ["'self'"],
        connectSrc: ["'self'", "ws:", "wss:"],
        frameSrc: ["'self'", "https://www.youtube.com"],
      },
    },
  }),
  compression(),
  morgan("combined"),
];

module.exports = securityMiddleware;
