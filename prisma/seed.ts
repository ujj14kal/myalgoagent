import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import fs from "node:fs";
import path from "node:path";

const ca = fs.readFileSync(
  path.join(process.cwd(), "certs", "rds-global-bundle.pem"),
  "utf-8",
);
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  ssl: { ca, rejectUnauthorized: true },
});
const prisma = new PrismaClient({ adapter });

const instruments = [
  { symbol: "RELIANCE.NS", name: "Reliance Industries Limited", exchange: "NSE", sector: "Energy" },
  { symbol: "TCS.NS", name: "Tata Consultancy Services Limited", exchange: "NSE", sector: "IT Services" },
  { symbol: "HDFCBANK.NS", name: "HDFC Bank Limited", exchange: "NSE", sector: "Financial Services" },
  { symbol: "INFY.NS", name: "Infosys Limited", exchange: "NSE", sector: "IT Services" },
  { symbol: "ICICIBANK.NS", name: "ICICI Bank Limited", exchange: "NSE", sector: "Financial Services" },
  { symbol: "HINDUNILVR.NS", name: "Hindustan Unilever Limited", exchange: "NSE", sector: "Consumer Goods" },
  { symbol: "ITC.NS", name: "ITC Limited", exchange: "NSE", sector: "Consumer Goods" },
  { symbol: "SBIN.NS", name: "State Bank of India", exchange: "NSE", sector: "Financial Services" },
  { symbol: "BHARTIARTL.NS", name: "Bharti Airtel Limited", exchange: "NSE", sector: "Telecom" },
  { symbol: "KOTAKBANK.NS", name: "Kotak Mahindra Bank Limited", exchange: "NSE", sector: "Financial Services" },
  { symbol: "LT.NS", name: "Larsen & Toubro Limited", exchange: "NSE", sector: "Construction" },
  { symbol: "AXISBANK.NS", name: "Axis Bank Limited", exchange: "NSE", sector: "Financial Services" },
  { symbol: "ASIANPAINT.NS", name: "Asian Paints Limited", exchange: "NSE", sector: "Consumer Goods" },
  { symbol: "MARUTI.NS", name: "Maruti Suzuki India Limited", exchange: "NSE", sector: "Automobile" },
  { symbol: "SUNPHARMA.NS", name: "Sun Pharmaceutical Industries Limited", exchange: "NSE", sector: "Pharmaceuticals" },
  { symbol: "TITAN.NS", name: "Titan Company Limited", exchange: "NSE", sector: "Consumer Goods" },
  { symbol: "ULTRACEMCO.NS", name: "UltraTech Cement Limited", exchange: "NSE", sector: "Cement" },
  { symbol: "NESTLEIND.NS", name: "Nestle India Limited", exchange: "NSE", sector: "Consumer Goods" },
  { symbol: "BAJFINANCE.NS", name: "Bajaj Finance Limited", exchange: "NSE", sector: "Financial Services" },
  { symbol: "WIPRO.NS", name: "Wipro Limited", exchange: "NSE", sector: "IT Services" },
  { symbol: "HCLTECH.NS", name: "HCL Technologies Limited", exchange: "NSE", sector: "IT Services" },
  { symbol: "ONGC.NS", name: "Oil and Natural Gas Corporation Limited", exchange: "NSE", sector: "Energy" },
  { symbol: "NTPC.NS", name: "NTPC Limited", exchange: "NSE", sector: "Power" },
  { symbol: "POWERGRID.NS", name: "Power Grid Corporation of India Limited", exchange: "NSE", sector: "Power" },
  { symbol: "TATAMOTORS.NS", name: "Tata Motors Limited", exchange: "NSE", sector: "Automobile" },
  { symbol: "TATASTEEL.NS", name: "Tata Steel Limited", exchange: "NSE", sector: "Metals" },
  { symbol: "JSWSTEEL.NS", name: "JSW Steel Limited", exchange: "NSE", sector: "Metals" },
  { symbol: "M&M.NS", name: "Mahindra & Mahindra Limited", exchange: "NSE", sector: "Automobile" },
  { symbol: "ADANIENT.NS", name: "Adani Enterprises Limited", exchange: "NSE", sector: "Diversified" },
  { symbol: "ADANIPORTS.NS", name: "Adani Ports and Special Economic Zone Limited", exchange: "NSE", sector: "Infrastructure" },
  { symbol: "COALINDIA.NS", name: "Coal India Limited", exchange: "NSE", sector: "Mining" },
  { symbol: "GRASIM.NS", name: "Grasim Industries Limited", exchange: "NSE", sector: "Cement" },
  { symbol: "BAJAJFINSV.NS", name: "Bajaj Finserv Limited", exchange: "NSE", sector: "Financial Services" },
  { symbol: "DRREDDY.NS", name: "Dr. Reddy's Laboratories Limited", exchange: "NSE", sector: "Pharmaceuticals" },
  { symbol: "CIPLA.NS", name: "Cipla Limited", exchange: "NSE", sector: "Pharmaceuticals" },
  { symbol: "EICHERMOT.NS", name: "Eicher Motors Limited", exchange: "NSE", sector: "Automobile" },
  { symbol: "HEROMOTOCO.NS", name: "Hero MotoCorp Limited", exchange: "NSE", sector: "Automobile" },
  { symbol: "DIVISLAB.NS", name: "Divi's Laboratories Limited", exchange: "NSE", sector: "Pharmaceuticals" },
  { symbol: "BRITANNIA.NS", name: "Britannia Industries Limited", exchange: "NSE", sector: "Consumer Goods" },
  { symbol: "INDUSINDBK.NS", name: "IndusInd Bank Limited", exchange: "NSE", sector: "Financial Services" },
  { symbol: "BPCL.NS", name: "Bharat Petroleum Corporation Limited", exchange: "NSE", sector: "Energy" },
];

async function main() {
  for (const instrument of instruments) {
    await prisma.instrument.upsert({
      where: { symbol: instrument.symbol },
      update: instrument,
      create: instrument,
    });
  }
  console.log(`Seeded ${instruments.length} instruments.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
