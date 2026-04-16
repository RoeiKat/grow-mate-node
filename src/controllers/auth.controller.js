const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const { signUserToken } = require("../utils/jwt");

async function register(req, res) {
  const { email, password, fullName } = req.body;

  if (!email || !password || !fullName) {
    throw new ApiError(400, "email, password and fullName are required");
  }

  const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
  if (existingUser) {
    throw new ApiError(409, "Email is already in use");
  }

  const user = await User.create({
    email: email.toLowerCase().trim(),
    password,
    fullName: fullName.trim()
  });

  const token = signUserToken(user);

  res.status(201).json({
    user: user.toSafeObject(),
    token
  });
}

async function login(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new ApiError(400, "email and password are required");
  }

  const user = await User.findOne({ email: email.toLowerCase().trim() });

  if (!user) {
    throw new ApiError(401, "Invalid credentials");
  }

  const isPasswordValid = await user.comparePassword(password);

  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid credentials");
  }

  const token = signUserToken(user);

  res.json({
    user: user.toSafeObject(),
    token
  });
}

async function me(req, res) {
  res.json({
    user: req.user.toSafeObject()
  });
}

module.exports = {
  register,
  login,
  me
};
