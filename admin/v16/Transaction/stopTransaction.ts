import * as uuid from "uuid";
import { sendAdminCommand } from "../../admin";

// Usage: CONNECTOR_ID=1 npx tsx admin/v16/Transaction/stopTransaction.ts
// Set AUTO_STOP_CONNECTOR=true to auto-fetch transaction on CONNECTOR_ID and auto-calc meter
// Set AUTO_STOP_CONNECTOR=false to use manual TRANSACTION_ID and METER_STOP from env
const autoStop = (process.env.AUTO_STOP_CONNECTOR ?? "false").toLowerCase() === "true";
const adminPort = process.env.ADMIN_PORT ?? "9999";
const connectorId = Number.parseInt(process.env.CONNECTOR_ID ?? "1");

async function getTransactionId(): Promise<number | null> {
  if (!autoStop && process.env.TRANSACTION_ID) {
    return Number.parseInt(process.env.TRANSACTION_ID);
  }
  if (!autoStop) {
    console.error(`AUTO_STOP_CONNECTOR=false but TRANSACTION_ID not set in env.`);
    return null;
  }
  
  // AUTO_STOP_CONNECTOR=true: find transaction on specified CONNECTOR_ID
  try {
    const res = await fetch(`http://localhost:${adminPort}/transactions`);
    if (!res.ok) {
      console.error(`Failed to fetch transactions (HTTP ${res.status}).`);
      return null;
    }
    const data = await res.json() as { transactions: Array<{ transactionId: number; connectorId: number }> };
    const transaction = data.transactions.find(tx => tx.connectorId === connectorId);
    if (!transaction) {
      console.error(`No active transaction found on connector ${connectorId}.`);
      return null;
    }
    console.log(`Auto-selected transaction ID ${transaction.transactionId} on connector ${connectorId}`);
    return transaction.transactionId;
  } catch (err) {
    console.error(`Failed to connect to VCP admin.`, err);
    return null;
  }
}

type MeterSnapshot = {
  meterValue: number;
  soc?: number;
  voltage?: number;
  outletTemp?: number;
  bodyTemp?: number;
};

async function getMeterSnapshot(transactionId: number): Promise<MeterSnapshot> {
  const fallback: MeterSnapshot = {
    meterValue: Number.parseInt(process.env.METER_STOP ?? "5000"),
    soc: Number.parseInt(process.env.SOC_END ?? "80"),
    voltage: Number.parseFloat(process.env.VOLTAGE ?? "16"),
    outletTemp: 55,
    bodyTemp: 40,
  };
  if (!autoStop) {
    return fallback;
  }
  try {
    const res = await fetch(`http://localhost:${adminPort}/transaction/${transactionId}/meter`);
    if (!res.ok) {
      console.error(`Failed to fetch meter (HTTP ${res.status}). Falling back to METER_STOP env.`);
      return fallback;
    }
    const data = await res.json() as MeterSnapshot;
    return {
      ...fallback,
      ...data,
      meterValue: data.meterValue ?? fallback.meterValue,
    };
  } catch (err) {
    console.error(`Failed to connect to VCP admin. Falling back to METER_STOP env.`, err);
    return fallback;
  }
}

(async () => {
  const transactionId = await getTransactionId();
  if (transactionId === null) {
    console.error(`Cannot stop transaction: no transaction ID available.`);
    process.exit(1);
  }
  
  const snapshot = await getMeterSnapshot(transactionId);
  const meterStop = snapshot.meterValue;
  const residualVoltage = (14 + Math.random() * 5).toFixed(1);

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
              value: Math.floor(meterStop).toString(),
              location: "Outlet",
              context: "Transaction.End",
              measurand: "Energy.Active.Import.Register",
              unit: "Wh",
            },
            {
              format: "Raw",
              value: Math.round(snapshot.outletTemp ?? 55).toString(),
              location: "Outlet",
              context: "Transaction.End",
              measurand: "Temperature",
              unit: "Celsius",
            },
            {
              format: "Raw",
              value: Math.round(snapshot.bodyTemp ?? 40).toString(),
              location: "Body",
              context: "Transaction.End",
              measurand: "Temperature",
              unit: "Celsius",
            },
            {
              format: "Raw",
              value: "0.0",
              location: "Outlet",
              context: "Transaction.End",
              measurand: "Current.Import",
              unit: "A",
            },
            {
              format: "Raw",
              value: residualVoltage,
              location: "Outlet",
              context: "Transaction.End",
              measurand: "Voltage",
              unit: "V",
            },
            {
              format: "Raw",
              value: "0.00",
              location: "Outlet",
              context: "Transaction.End",
              measurand: "Power.Active.Import",
              unit: "W",
            },
            {
              format: "Raw",
              value: Math.round(snapshot.soc ?? 80).toString(),
              location: "EV",
              context: "Transaction.End",
              measurand: "SoC",
              unit: "Percent",
            },
          ],
        },
      ],
    },
  });

  console.log(`MeterValues sent: Transaction.End (current 0.0 A, power 0.00 W)`);

  // Send StopTransaction
  sendAdminCommand({
    action: "StopTransaction",
    messageId: uuid.v4(),
    payload: {
      transactionId: transactionId,
      timestamp: new Date().toISOString(),
      meterStop: meterStop, // In Wh (not kWh)
    },
  });

  console.log(`StopTransaction sent:`);
  console.log(`  Mode: ${autoStop ? `auto-stop connector ${connectorId}` : "manual (from env)"}`);
  console.log(`  Transaction ID: ${transactionId}`);
  console.log(`  Meter Stop: ${meterStop} Wh`);

  // Wait a bit then send Finishing status
  await new Promise(resolve => setTimeout(resolve, 500));
  
  sendAdminCommand({
    action: "StatusNotification",
    messageId: uuid.v4(),
    payload: {
      connectorId: connectorId,
      errorCode: "NoError",
      status: "Finishing",
      timestamp: new Date().toISOString(),
    },
  });

  console.log(`StatusNotification sent: Finishing on connector ${connectorId}`);
})();

