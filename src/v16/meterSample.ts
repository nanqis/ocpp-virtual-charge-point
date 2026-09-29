import type { ElectricalState } from "../transactionManager";

export type MeterSampleContext = "Sample.Periodic" | "Transaction.End";

type MeterSampledValue = {
  format: "Raw";
  value: string;
  location: "Outlet" | "Body" | "EV";
  context: MeterSampleContext;
  measurand:
    | "Energy.Active.Import.Register"
    | "Temperature"
    | "Current.Import"
    | "Voltage"
    | "Power.Active.Import"
    | "SoC";
  unit: "Wh" | "Celsius" | "A" | "V" | "W" | "Percent";
};

export function buildMeterSampledValues(
  state: ElectricalState,
  context: MeterSampleContext,
): [MeterSampledValue, ...MeterSampledValue[]] {
  return [
    {
      format: "Raw" as const,
      value: Math.floor(state.meterValue).toString(),
      location: "Outlet" as const,
      context,
      measurand: "Energy.Active.Import.Register" as const,
      unit: "Wh" as const,
    },
    {
      format: "Raw" as const,
      value: Math.round(state.outletTemp).toString(),
      location: "Outlet" as const,
      context,
      measurand: "Temperature" as const,
      unit: "Celsius" as const,
    },
    {
      format: "Raw" as const,
      value: Math.round(state.bodyTemp).toString(),
      location: "Body" as const,
      context,
      measurand: "Temperature" as const,
      unit: "Celsius" as const,
    },
    {
      format: "Raw" as const,
      value: state.current.toFixed(1),
      location: "Outlet" as const,
      context,
      measurand: "Current.Import" as const,
      unit: "A" as const,
    },
    {
      format: "Raw" as const,
      value: state.voltage.toFixed(1),
      location: "Outlet" as const,
      context,
      measurand: "Voltage" as const,
      unit: "V" as const,
    },
    {
      format: "Raw" as const,
      value: state.powerWatts.toFixed(2),
      location: "Outlet" as const,
      context,
      measurand: "Power.Active.Import" as const,
      unit: "W" as const,
    },
    {
      format: "Raw" as const,
      value: Math.round(state.soc).toString(),
      location: "EV" as const,
      context,
      measurand: "SoC" as const,
      unit: "Percent" as const,
    },
  ];
}
