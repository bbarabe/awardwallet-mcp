/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ALL_OPERATIONS } from "../../src/catalog/index.js";
import type { ApiOperation } from "../../src/catalog/types.js";

// Every API module in src/catalog exports one or more `ApiOperation[]` arrays.
const modules = import.meta.glob<Record<string, unknown>>(["../../src/catalog/*.ts", "!../../src/catalog/index.ts"], { eager: true });

function isOperationArray(value: unknown): value is ApiOperation[] {
  return Array.isArray(value) && value.length > 0 && typeof value[0] === "object" && value[0] !== null && "id" in value[0] && "input" in value[0];
}

const fromModules: ApiOperation[] = Object.values(modules).flatMap((mod) =>
  Object.values(mod as Record<string, unknown>).filter(isOperationArray).flat(),
);
const operations = [...ALL_OPERATIONS];

it("registers every catalog module's operations in ALL_OPERATIONS", () => {
  expect(new Set(operations.map((op) => op.id))).toEqual(new Set(fromModules.map((op) => op.id)));
});

const API_PREFIX: Record<ApiOperation["api"], string> = {
  accountAccess: "account_access.",
  webParsing: "web_parsing.",
  emailParsing: "email_parsing.",
  creditCardBonus: "credit_card_bonus.",
  flightAwardSearch: "flight_award_search.",
  hotelAwardSearch: "hotel_award_search.",
};

function bodyShape(op: ApiOperation): z.ZodObject<z.ZodRawShape> | undefined {
  const body = op.input.shape["body"];
  if (!body) return undefined;
  const inner = body instanceof z.ZodOptional ? body.unwrap() : body;
  return inner instanceof z.ZodObject ? (inner as z.ZodObject<z.ZodRawShape>) : undefined;
}

function hasPath(schema: z.ZodObject<z.ZodRawShape>, dotted: string): boolean {
  let current: z.ZodType | undefined = schema;
  for (const part of dotted.split(".")) {
    while (current instanceof z.ZodOptional || current instanceof z.ZodNullable || current instanceof z.ZodDefault) {
      current = (current as z.ZodOptional<z.ZodType>).unwrap() as z.ZodType;
    }
    if (!(current instanceof z.ZodObject)) return false;
    current = (current.shape as Record<string, z.ZodType>)[part];
    if (!current) return false;
  }
  return true;
}

describe("API operation catalog", () => {
  it("loads operations", () => {
    expect(operations.length).toBeGreaterThan(0);
  });

  it("has unique ids", () => {
    const ids = operations.map((op) => op.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const op of operations) {
    describe(op.id, () => {
      it("uses the id prefix of its API", () => {
        expect(op.id.startsWith(API_PREFIX[op.api])).toBe(true);
        expect(op.id).toMatch(/^[a-z_]+\.[a-z0-9_]+$/);
      });

      it("has a title, description and https docs link", () => {
        expect(op.title.length).toBeGreaterThan(3);
        expect(op.description.length).toBeGreaterThan(20);
        expect(op.description.length).toBeLessThanOrEqual(400);
        expect(op.docsUrl).toMatch(/^https:\/\/awardwallet\.com\/api\//);
      });

      it("declares every path placeholder as a top-level input key", () => {
        const placeholders = [...op.path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]!);
        for (const name of placeholders) expect(Object.keys(op.input.shape)).toContain(name);
        expect(op.path.startsWith("/")).toBe(true);
      });

      it("only uses path params, query and body as input keys", () => {
        const placeholders = new Set([...op.path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]!));
        for (const key of Object.keys(op.input.shape)) {
          expect(placeholders.has(key) || key === "query" || key === "body").toBe(true);
        }
      });

      it("does not send a body on GET", () => {
        if (op.method === "GET") expect(op.input.shape["body"]).toBeUndefined();
      });

      it("keeps secret fields out of the caller-supplied body", () => {
        for (const secret of op.secretFields ?? []) {
          expect(secret.path).not.toMatch(/\[|\]/);
          const body = bodyShape(op);
          if (body) expect(hasPath(body, secret.path)).toBe(false);
        }
        if (op.secretFields?.length) expect(op.access).toBe("write");
      });

      it("converts to JSON Schema", () => {
        expect(() => z.toJSONSchema(op.input, { io: "input", unrepresentable: "any" })).not.toThrow();
      });
    });
  }
});
