import type { VCP } from "./vcp";

const METER_VALUES_INTERVAL_SEC = 15;

// Charging simulation config from env
const SOC_START = Number.parseInt(process.env.SOC_START ?? "20");
const SOC_END = Number.parseInt(process.env.SOC_END ?? "80");
const POWER_KW = Number.parseFloat(process.env.POWER ?? "34.2");
const VOLTAGE = Number.parseFloat(process.env.VOLTAGE ?? "450");
// Wh accumulated per second for Energy.Active.Import.Register (66.67 → ~1 kWh per 15s tick)
const METER_WH_PER_SEC = Number.parseFloat(process.env.METER_WH_PER_SEC ?? "66.67");
// Estimated total charging duration in ms (rough: assume 50kWh battery, SOC range determines energy needed)
const BATTERY_CAPACITY_KWH = 50;
const ESTIMATED_DURATION_MS =
  ((SOC_END - SOC_START) / 100) * BATTERY_CAPACITY_KWH * (1 / POWER_KW) * 3600 * 1000;
const MIN_POWER_RATIO = 0.3;

type TransactionId = string | number;

export interface TransactionState {
  startedAt: Date;
  idTag: string;
  transactionId: TransactionId;
  meterValue: number;
  soc: number;
  power: number;
  voltage: number;
  current: number;
  powerWatts: number;
  outletTemp: number;
  bodyTemp: number;
  evseId?: number;
  connectorId: number;
}

export type ElectricalState = Pick<
  TransactionState,
  | "meterValue"
  | "soc"
  | "power"
  | "voltage"
  | "current"
  | "powerWatts"
  | "outletTemp"
  | "bodyTemp"
>;

interface StartTransactionProps {
  transactionId: TransactionId;
  idTag: string;
  evseId?: number;
  connectorId: number;
  meterValuesCallback: (transactionState: TransactionState) => Promise<void>;
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function jitter(value: number, amount: number, decimals: number): number {
  return roundTo(value + (Math.random() * 2 - 1) * amount, decimals);
}

export class TransactionManager {
  transactions: Map<
    TransactionId,
    TransactionState & { meterValuesTimer: NodeJS.Timer }
  > = new Map();

  canStartNewTransaction(connectorId: number) {
    return !Array.from(this.transactions.values()).some(
      (transaction) => transaction.connectorId === connectorId,
    );
  }

  startTransaction(vcp: VCP, startTransactionProps: StartTransactionProps) {
    const meterValuesTimer = setInterval(() => {
      // biome-ignore lint/style/noNonNullAssertion: transaction must exist
      const currentTransactionState = this.transactions.get(
        startTransactionProps.transactionId,
      )!;
      const { meterValuesTimer, ...currentTransaction } =
        currentTransactionState;
      startTransactionProps.meterValuesCallback({
        ...currentTransaction,
        ...this.getLiveElectricals(startTransactionProps.transactionId),
      });
    }, METER_VALUES_INTERVAL_SEC * 1000);
    const initial = this.buildElectricals(SOC_START, POWER_KW);
    this.transactions.set(startTransactionProps.transactionId, {
      transactionId: startTransactionProps.transactionId,
      idTag: startTransactionProps.idTag,
      ...initial,
      startedAt: new Date(),
      evseId: startTransactionProps.evseId,
      connectorId: startTransactionProps.connectorId,
      meterValuesTimer: meterValuesTimer,
    });
  }

  stopTransaction(transactionId: TransactionId) {
    const transaction = this.transactions.get(transactionId);
    if (transaction?.meterValuesTimer) {
      clearInterval(transaction.meterValuesTimer);
    }
    this.transactions.delete(transactionId);
  }

  getMeterValue(transactionId: TransactionId) {
    const transaction = this.transactions.get(transactionId);
    if (!transaction) {
      return 0;
    }
    const elapsedSec =
      (new Date().getTime() - transaction.startedAt.getTime()) / 1000;
    return elapsedSec * METER_WH_PER_SEC;
  }

  getSoc(transactionId: TransactionId): number {
    const transaction = this.transactions.get(transactionId);
    if (!transaction) {
      return SOC_START;
    }
    const elapsed = new Date().getTime() - transaction.startedAt.getTime();
    const progress = Math.min(elapsed / ESTIMATED_DURATION_MS, 1);
    return Math.round(SOC_START + (SOC_END - SOC_START) * progress);
  }

  getPower(transactionId: TransactionId): number {
    const soc = this.getSoc(transactionId);
    // Taper power when SoC > 80% of target range (simulates DC charging curve).
    // Keep a floor so Current.Import stays detectable until StopTransaction.
    const taperThreshold = SOC_START + (SOC_END - SOC_START) * 0.8;
    if (soc >= taperThreshold) {
      const taperSpan = Math.max(SOC_END - taperThreshold, 1);
      const taperProgress = Math.min((soc - taperThreshold) / taperSpan, 1);
      return roundTo(
        POWER_KW * (1 - taperProgress * (1 - MIN_POWER_RATIO)),
        2,
      );
    }
    return POWER_KW;
  }

  getLiveElectricals(transactionId: TransactionId): ElectricalState {
    const transaction = this.transactions.get(transactionId);
    if (!transaction) {
      return {
        meterValue: 0,
        soc: SOC_START,
        power: 0,
        voltage: VOLTAGE,
        current: 0,
        powerWatts: 0,
        outletTemp: 38,
        bodyTemp: 34,
      };
    }
    return this.buildElectricals(
      this.getSoc(transactionId),
      this.getPower(transactionId),
      this.getMeterValue(transactionId),
    );
  }

  getEndElectricals(transactionId: TransactionId): ElectricalState {
    const live = this.getLiveElectricals(transactionId);
    return {
      ...live,
      current: 0,
      power: 0,
      powerWatts: 0,
      voltage: roundTo(14 + Math.random() * 5, 1),
    };
  }

  private buildElectricals(
    soc: number,
    powerKw: number,
    meterValue = 0,
  ): ElectricalState {
    const socRange = Math.max(SOC_END - SOC_START, 1);
    const socProgress = Math.min(Math.max((soc - SOC_START) / socRange, 0), 1);
    const voltage = jitter(VOLTAGE + socProgress * 8, 1.5, 1);
    const safeVoltage = Math.max(voltage, 1);
    const current = jitter((powerKw * 1000) / safeVoltage, 0.4, 1);
    const powerWatts = roundTo(current * safeVoltage, 2);
    const load = POWER_KW > 0 ? Math.min(powerKw / POWER_KW, 1) : 0;
    return {
      meterValue,
      soc,
      power: powerKw,
      voltage,
      current,
      powerWatts,
      outletTemp: Math.round(jitter(52 + load * 8, 1.2, 0)),
      bodyTemp: Math.round(jitter(36 + load * 8, 1.0, 0)),
    };
  }
}
