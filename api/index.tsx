import { Button, Frog, TextInput } from "frog";
import { devtools } from "frog/dev";
import { serveStatic } from "frog/serve-static";
// import { neynar } from 'frog/hubs'
import { handle } from "frog/vercel";
import { Address, parseEther, isAddress } from "viem";
import { getChainIdFromName } from "../utils/lib.js";
import { spokePoolContractAbi } from "../utils/across.js";

// Uncomment to use Edge Runtime.
// export const config = {
//   runtime: 'edge',
// }

const networks = ["ethereum", "base", "optimism", "arbitrum"] as const;
export type Networks = (typeof networks)[number];

export const app = new Frog({
  assetsPath: "/",
  basePath: "/api",
  // Supply a Hub to enable frame verification.
  // hub: neynar({ apiKey: 'NEYNAR_FROG_FM' })
});

app.frame("/", (c) => {
  return c.res({
    action: "/finish",
    image: (
      <div
        style={{
          alignItems: "center",
          background: "linear-gradient(to right, #432889, #17101F)",
          backgroundSize: "100% 100%",
          display: "flex",
          flexDirection: "column",
          flexWrap: "nowrap",
          height: "100%",
          justifyContent: "center",
          textAlign: "center",
          width: "100%",
        }}
      >
        <div
          style={{
            color: "white",
            fontSize: 60,
            fontStyle: "normal",
            letterSpacing: "-0.025em",
            lineHeight: 1.4,
            marginTop: 30,
            padding: "0 120px",
            whiteSpace: "pre-wrap",
          }}
        >
          Bridge to arbitrum
        </div>
      </div>
    ),
    intents: [
      <TextInput placeholder="Bridge to arbitrum" />,
      ...networks.map((n) => (
        <Button.Transaction target={`/tx?from=${n}`}>
          {n.slice(0, 1).toUpperCase() + n.slice(1)}
        </Button.Transaction>
      )),
    ],
  });
});

app.transaction("/tx", async (c) => {
  const fromNetwork = c.req.query("from") as Networks;
  const toNetwork = "arbitrum";
  const bridgeAmount = c.inputText || "0.01";

  if (!c.address || !isAddress(c.address)) {
    return c.error({ message: "No address found" });
  }

  const wethByChain = {
    ethereum: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    base: "0x4200000000000000000000000000000000000006",
    arbitrum: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
    optimism: "0x4200000000000000000000000000000000000006",
  } as const;

  const inputToken = wethByChain[fromNetwork];
  const outputToken = wethByChain["arbitrum"];
  const parsedAmount = parseEther(bridgeAmount);
  const destinationChainId = getChainIdFromName(toNetwork);
  const originChainId = getChainIdFromName(fromNetwork)

  const url = "https://app.across.to/api/suggested-fees";
  const params = new URLSearchParams({
    inputToken,
    outputToken,
    originChainId,
    destinationChainId,
    amount: parsedAmount.toString(),
  });

  const endpoint = `${url}?${params.toString()}`;
  const acrossRes = await fetch(endpoint);
  const across = (await acrossRes.json()) as {
    totalRelayFee: { total: string };
    timestamp: string;
    spokePoolAddress: Address;
  };

  return c.contract({
    abi: spokePoolContractAbi,
    to: across.spokePoolAddress,
    chainId: `eip155:${getChainIdFromName(fromNetwork)}`,
    value: parseEther(bridgeAmount),
    functionName: "depositV3",
    args: [
      c.address, // depositor
      c.address, // recipient
      inputToken, // inputToken
      outputToken, // outputToken
      parsedAmount, // inputAmount
      parsedAmount - BigInt(across.totalRelayFee.total), // outputAmount
      BigInt(destinationChainId), // destinationChainId
      "0x0000000000000000000000000000000000000000", // exclusiveRelayer
      Number(across.timestamp), // quoteTimestamp
      Math.round(Date.now() / 1000) + 600, // fillDeadline (10 minutes)
      0, // exclusivityDeadline
      "0x", // message
    ],
  });
});

app.frame("/finish", async (c) => {
  return c.res({
    image: (
      <div>
        <span
          style={{
            width: "100vw",
            paddingLeft: 80,
            paddingRight: 80,
            lineHeight: "1",
          }}
        >
          Your ETH should arrive in a few seconds
        </span>

        <div
          style={{
            display: "flex",
            width: "100vw",
            paddingLeft: 80,
            fontSize: 42,
            color: "#ADA6B4",
          }}
        >
          Created by @greg
        </div>
      </div>
    ),
  });
});

// @ts-ignore
const isEdgeFunction = typeof EdgeFunction !== "undefined";
const isProduction = isEdgeFunction || import.meta.env?.MODE !== "development";
devtools(app, isProduction ? { assetsPath: "/.frog" } : { serveStatic });

export const GET = handle(app);
export const POST = handle(app);
