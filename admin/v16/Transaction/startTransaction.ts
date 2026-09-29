import * as uuid from "uuid";
import { sendAdminCommand } from "../../admin";

// Usage: 
// Set environment variables or modify these defaults:
// - CONNECTOR_ID: connector number (default: 1)
// - ID_TAG: must match location_charger_port_code in database
// - METER_START: starting meter value in Wh (default: 0)

const connectorId = Number.parseInt(process.env.CONNECTOR_ID ?? "1");
const idTag = process.env.ID_TAG ?? "TesterChargerTag123";
const meterStart = Number.parseInt(process.env.METER_START ?? "0");

sendAdminCommand({
  action: "StartTransaction",
  messageId: uuid.v4(),
  payload: {
    connectorId: connectorId,
    idTag: idTag,
    meterStart: meterStart, // In Wh (not kWh) to match real chargers
    timestamp: new Date().toISOString(),
  },
});

console.log(`StartTransaction sent:`);
console.log(`  Connector: ${connectorId}`);
console.log(`  idTag: ${idTag}`);
console.log(`  meterStart: ${meterStart} Wh`);
console.log(`\nIMPORTANT: Make sure idTag matches location_charger_port_code in database`);
console.log(`Run: curl "http://localhost/test-charger-config?cp_id=YOUR_CP_ID" to get the correct port_code`);
