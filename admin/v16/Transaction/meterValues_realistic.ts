import * as uuid from "uuid";
import { sendAdminCommand } from "../../admin";

// Simulates DC charger MeterValues like the real winline log
// Usage:
// TRANSACTION_ID=123 ENERGY=25000 POWER=45 VOLTAGE=450 npx tsx admin/v16/Transaction/meterValues_realistic.ts

const transactionId = Number.parseInt(process.env.TRANSACTION_ID ?? "1");
const connectorId = Number.parseInt(process.env.CONNECTOR_ID ?? "1");

const energy = Number.parseFloat(process.env.ENERGY ?? "24900");
const powerKw = Number.parseFloat(process.env.POWER ?? "45");
const voltage = Number.parseFloat(process.env.VOLTAGE ?? "450");
const current = Number.parseFloat(
  process.env.CURRENT ?? ((powerKw * 1000) / Math.max(voltage, 1)).toFixed(1),
);
const powerWatts = Number.parseFloat((current * voltage).toFixed(2));
const outletTemp = Number.parseFloat(process.env.TEMPERATURE ?? "57");
const bodyTemp = Number.parseFloat(process.env.BODY_TEMPERATURE ?? "40");
const soc = Number.parseInt(process.env.SOC ?? "50");

sendAdminCommand({
  action: "MeterValues",
  messageId: uuid.v4(),
  payload: {
    connectorId: connectorId,
    transactionId: transactionId,
    meterValue: [
      {
        timestamp: new Date().toISOString(),
        sampledValue: [
          {
            format: "Raw",
            value: Math.floor(energy).toString(),
            location: "Outlet",
            context: "Sample.Periodic",
            measurand: "Energy.Active.Import.Register",
            unit: "Wh",
          },
          {
            format: "Raw",
            value: outletTemp.toString(),
            location: "Outlet",
            context: "Sample.Periodic",
            measurand: "Temperature",
            unit: "Celsius",
          },
          {
            format: "Raw",
            value: bodyTemp.toString(),
            location: "Body",
            context: "Sample.Periodic",
            measurand: "Temperature",
            unit: "Celsius",
          },
          {
            format: "Raw",
            value: current.toFixed(1),
            location: "Outlet",
            context: "Sample.Periodic",
            measurand: "Current.Import",
            unit: "A",
          },
          {
            format: "Raw",
            value: voltage.toFixed(1),
            location: "Outlet",
            context: "Sample.Periodic",
            measurand: "Voltage",
            unit: "V",
          },
          {
            format: "Raw",
            value: powerWatts.toFixed(2),
            location: "Outlet",
            context: "Sample.Periodic",
            measurand: "Power.Active.Import",
            unit: "W",
          },
          {
            format: "Raw",
            value: soc.toString(),
            location: "EV",
            context: "Sample.Periodic",
            measurand: "SoC",
            unit: "Percent",
          },
        ],
      },
    ],
  },
});

console.log(`MeterValues sent (DC charger format):`);
console.log(`  Transaction ID: ${transactionId}`);
console.log(`  Connector: ${connectorId}`);
console.log(`  Energy: ${energy} Wh`);
console.log(`  Current: ${current.toFixed(1)} A`);
console.log(`  Voltage: ${voltage.toFixed(1)} V`);
console.log(`  Power: ${powerWatts.toFixed(2)} W`);
console.log(`  Outlet temp: ${outletTemp}°C`);
console.log(`  Body temp: ${bodyTemp}°C`);
console.log(`  SoC: ${soc}%`);
