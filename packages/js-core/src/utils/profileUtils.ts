import jwt from "jsonwebtoken";
import { envConfig } from "../envConfig";
import CustomError from "../customError";
import { ApiResponse } from "../interface";

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

export function generateJwt(profileId: number, fingerprint: string | null = null, agentId: number | null = null) {
  return jwt.sign({ profileId, fingerprint, deviceFingerprint: envConfig.FINGERPRINT, agentId }, envConfig.SECRET_KEY, { expiresIn: "300d" });
}

export function verifyJwt(token: string) : { profileId: number, fingerprint: string | null, agentId: number | null } | null {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, envConfig.SECRET_KEY) as jwt.JwtPayload;
    if (payload.deviceFingerprint !== envConfig.FINGERPRINT) return null;
    return {
      profileId: payload.profileId,
      fingerprint: payload.fingerprint,
      agentId: payload.agentId,
    }
  } catch (e) {
    return null;
  }
}

export function login(profileId: number, res: ApiResponse) {
  res.setCookie("jwt", generateJwt(profileId));
}

export function logout(res: ApiResponse) {
  res.setCookie("jwt", "", 0);
}
