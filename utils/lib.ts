import { Networks } from "../api/index.js";

export function getChainIdFromName(name: Networks | "ethereum") {
  switch (name) {
    case "ethereum":
      return "1";
    case "base":
      return "8453";
    case "arbitrum":
      return "42161";
    case "optimism":
      return "10";
  }
}
