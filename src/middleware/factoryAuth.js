const ApiError = require("../utils/ApiError");

function requireFactoryAuth(req, res, next) {
  const factoryApiKey = process.env.FACTORY_API_KEY;
  if (!factoryApiKey) {
    return next();
  }

  const header = req.headers["x-factory-api-key"];
  if (header !== factoryApiKey) {
    return next(new ApiError(401, "Invalid factory API key"));
  }

  next();
}

module.exports = {
  requireFactoryAuth
};
