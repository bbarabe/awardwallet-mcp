import { z } from "zod";
import type { ApiOperation } from "./types.js";

const DOCS = "https://awardwallet.com/api/cc";

/** Raw Credit Card Bonus API endpoints (https://awardwallet.com/api/cc), relative to https://us-cc-api.awardwallet.com/v1. */
export const creditCardBonusOperations: ApiOperation[] = [
  {
    id: "credit_card_bonus.list_cards",
    api: "creditCardBonus",
    title: "List credit cards and bonuses",
    description:
      "Lists supported US credit cards (Amex, Bank of America, Barclays, Capital One, Chase, Citi, Discover, U.S. Bank, Wells Fargo) with issuer, card type, cashback flag, AwardWallet point value and bonus multipliers by category and merchant group, with start/end dates. Set showExpiredBonuses to include expired bonuses.",
    method: "GET",
    path: "/cards",
    access: "read",
    docsUrl: `${DOCS}#method-List%20Credit%20Cards_1`,
    input: z.object({
      query: z
        .object({
          showExpiredBonuses: z
            .enum(["true"])
            .optional()
            .describe("'true' to also return expired bonus categories; omit for current bonuses only"),
        })
        .optional(),
    }),
    keywords: ["credit cards", "category bonuses", "multipliers", "earning", "rewards", "cashback", "merchants"],
  },
];
