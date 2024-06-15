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

const networks = ["base", "optimism", "ethereum",] as const;
export type Networks = (typeof networks)[number];

const baseUrls: Record<Networks, string> = {
  ethereum:
    "https://etherscan.io/tx",
  base: "https://basescan.org/tx",
  optimism:
    "https://optimistic.etherscan.io/tx",
};



export const app = new Frog({
  assetsPath: "/",
  basePath: "/api",
  // Supply a Hub to enable frame verification.
  // hub: neynar({ apiKey: 'NEYNAR_FROG_FM' })
});

app.frame("/", (c) => {
  return c.res({
    action: "/finish",
    
    image: "https://i.ibb.co/5LCxhw9/bridge.png",
    intents: [
      <TextInput placeholder="Amount. e.g 0.1" />,
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

app.frame("/finish/:network", async (c) => {
  let network = c.req.param('network') as Networks
  if(!network) network = "base"
  const { transactionId, frameData } = c;
  console.log("User transacted", frameData?.fid);
  const transactionHash = `${baseUrls[network]}/${transactionId}`;


  console.log({ transactionHash });

  return c.res({
    image: "https://pbs.twimg.com/media/F4M9IOlWwAEgTDf.jpg",
    intents: [
      <Button.Link href={transactionHash}>View Transaction</Button.Link>,
      <Button.Reset>Home</Button.Reset>,
    ],
  });
});

// @ts-ignore
const isEdgeFunction = typeof EdgeFunction !== "undefined";
const isProduction = isEdgeFunction || import.meta.env?.MODE !== "development";
devtools(app, isProduction ? { assetsPath: "/.frog" } : { serveStatic });

export const GET = handle(app);
export const POST = handle(app);
