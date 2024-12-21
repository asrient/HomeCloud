import jwt from "jsonwebtoken";
import { envConfig, RequestOriginType } from "../envConfig";
import CustomError from "../customError";
import { ApiResponse } from "../interface";
import path from "path";
import fs from "fs";

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

/**
 * @param type
 * @param fingerprint
 * @param agentId
 * @returns The generated JWT token.
*/
export function generateJwt(type: RequestOriginType, fingerprint: string | null = null, agentId: number | null = null) {
  return jwt.sign({ type, fingerprint, deviceFingerprint: envConfig.FINGERPRINT, agentId }, envConfig.SECRET_KEY, { expiresIn: "300d" });
}

/**
 * Verifies a JWT token and returns the payload if valid.
 * @param token 
 * @returns The payload json if the token is valid, otherwise null.
 */
export function verifyJwt(token: string): { type: RequestOriginType, fingerprint: string | null, agentId: number | null } | null {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, envConfig.SECRET_KEY) as jwt.JwtPayload;
    if (payload.deviceFingerprint !== envConfig.FINGERPRINT) return null;
    return {
      type: payload.type,
      fingerprint: payload.fingerprint,
      agentId: payload.agentId,
    }
  } catch (e) {
    return null;
  }
}

export function login(res: ApiResponse) {
  res.setCookie("jwt", generateJwt(RequestOriginType.Web));
}

export function logout(res: ApiResponse) {
  res.setCookie("jwt", "", 0);
  // res.setWebToken("");
}
