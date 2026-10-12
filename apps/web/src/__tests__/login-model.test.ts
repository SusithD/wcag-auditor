import { describe, expect, it } from "vitest";
import {
  describeAuthError,
  describeQueryError,
  MIN_PASSWORD,
  validateCredentials,
} from "@/components/auth/login-model";
import { NOT_INVITED_MESSAGE } from "@/lib/auth/policy";

describe("login model", () => {
  it("shows the invite message for a not-invited error", () => {
    expect(describeAuthError({ code: "NOT_INVITED" }, "signup")).toBe(
      NOT_INVITED_MESSAGE,
    );
    expect(describeQueryError("NOT_INVITED")).toBe(NOT_INVITED_MESSAGE);
    expect(describeQueryError("")).toBe("");
  });

  it("explains wrong credentials without naming which part was wrong", () => {
    expect(
      describeAuthError({ code: "INVALID_EMAIL_OR_PASSWORD" }, "signin"),
    ).toMatch(/do not match/);
  });

  it("validates sign-up fields inline", () => {
    const errors = validateCredentials({
      mode: "signup",
      name: "",
      email: "nope",
      password: "short",
    });
    expect(errors.name).toBeTruthy();
    expect(errors.email).toBeTruthy();
    expect(errors.password).toContain(String(MIN_PASSWORD));
    expect(
      validateCredentials({
        mode: "signin",
        name: "",
        email: "a@b.co",
        password: "x",
      }),
    ).toEqual({});
  });
});
