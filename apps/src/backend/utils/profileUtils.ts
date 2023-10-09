import jwt from "jsonwebtoken";
import { envConfig } from "../envConfig";
import CustomError from "../customError";

export function validateUsernameString(name: string): string {
  name = name.trim().toLowerCase();
  if (name.length < 4)
    throw CustomError.validationSingle(
      "username",
      "Username must be at least 4 characters long.",
    );
  if (name.length > 20)
    throw CustomError.validationSingle(
      "username",
      "Username must be at most 20 characters long.",
    );
  if (!/^[a-zA-Z0-9_]+$/.test(name))
    throw CustomError.validationSingle(
      "username",
      "Username must only contain letters, numbers, and underscores.",
    );
  return name;
}

export function validateNameString(name: string): string {
  name = name.trim();
  if (name.length < 2)
    throw CustomError.validationSingle(
      "name",
      "Name must be at least 2 characters long.",
    );
  if (name.length > 15)
    throw CustomError.validationSingle(
      "name",
      "Name must be at most 15 characters long.",
    );
  return name;
}

export function validatePasswordString(password: string): string {
  password = password.trim();
  if (password.length < 6)
    throw CustomError.validationSingle(
      "password",
      "Password must be at least 6 characters long.",
    );
  if (password.length > 25)
    throw CustomError.validationSingle(
      "password",
      "Password must be at most 25 characters long.",
    );
  return password;
}

export function generateJwt(profileId: number) {
  return jwt.sign({ profileId }, envConfig.SECRET_KEY, { expiresIn: "30d" });
}

export function verifyJwt(token: string) {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, envConfig.SECRET_KEY) as jwt.JwtPayload;
    return payload.profileId;
  } catch (e) {
    return null;
  }
}
