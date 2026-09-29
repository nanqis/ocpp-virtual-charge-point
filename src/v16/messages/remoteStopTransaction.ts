import { z } from "zod";
import { generateOCMF, getOCMFPublicKey } from "../../ocmfGenerator";
import { type OcppCall, OcppIncoming } from "../../ocppMessage";
import type { VCP } from "../../vcp";
import { buildMeterSampledValues } from "../meterSample";
import { meterValuesOcppMessage } from "./meterValues";
import { statusNotificationOcppMessage } from "./statusNotification";
import { stopTransactionOcppMessage } from "./stopTransaction";

const RemoteStopTransactionReqSchema = z.object({
  transactionId: z.number().int(),
});
type RemoteStopTransactionReqType = typeof RemoteStopTransactionReqSchema;

const RemoteStopTransactionResSchema = z.object({
  status: z.enum(["Accepted", "Rejected"]),
});
type RemoteStopTransactionResType = typeof RemoteStopTransactionResSchema;

class RemoteStopTransactionOcppMessage extends OcppIncoming<
  RemoteStopTransactionReqType,
  RemoteStopTransactionResType
> {
  reqHandler = async (
    vcp: VCP,
    call: OcppCall<z.infer<RemoteStopTransactionReqType>>,
  ): Promise<void> => {
    const transactionId = call.payload.transactionId;
    const transaction = vcp.transactionManager.transactions.get(transactionId);
    if (!transaction) {
      vcp.respond(this.response(call, { status: "Rejected" }));
      return;
    }
    vcp.respond(this.response(call, { status: "Accepted" }));

    const ocmf = generateOCMF({
      startTime: transaction.startedAt,
      startEnergy: 0,
      endTime: new Date(),
      endEnergy: vcp.transactionManager.getMeterValue(transactionId) / 1000,
      idTag: transaction.idTag,
    });

    const endElectricals =
      vcp.transactionManager.getEndElectricals(transactionId);
    vcp.send(
      meterValuesOcppMessage.request({
        connectorId: transaction.connectorId,
        transactionId: transactionId,
        meterValue: [
          {
            timestamp: new Date().toISOString(),
            sampledValue: buildMeterSampledValues(
              endElectricals,
              "Transaction.End",
            ),
          },
        ],
      }),
    );

    // Send Finishing status FIRST (transaction is ending)
    vcp.send(
      statusNotificationOcppMessage.request({
        connectorId: transaction.connectorId,
        errorCode: "NoError",
        status: "Finishing",
      }),
    );
    
    // Small delay to ensure Finishing status is processed before StopTransaction
    setTimeout(() => {
      vcp.send(
        stopTransactionOcppMessage.request({
          transactionId: transactionId,
          meterStop: Math.floor(
            vcp.transactionManager.getMeterValue(transactionId),
          ),
          timestamp: new Date().toISOString(),
          // Removed transactionData - it was causing NestJS to silently fail processing
        }),
      );
      
      // Stop the transaction to clear MeterValues interval
      vcp.transactionManager.stopTransaction(transactionId);
      
      // Simulate idle period - car is plugged in but not charging (idle fees accumulating)
      // Stay in Finishing status during this time
      const idlePeriodMinutes = parseInt(process.env.IDLE_PERIOD_MINUTES || "10");
      console.log(`Simulating idle period: ${idlePeriodMinutes} minutes before sending Preparing status`);
      
      setTimeout(() => {
        // After idle period, send Preparing status (charger will be unlocked)
        vcp.send(
          statusNotificationOcppMessage.request({
            connectorId: transaction.connectorId,
            errorCode: "NoError",
            status: "Available",
          }),
        );
        
        // Wait for the preparing period before sending Available status
        // setTimeout(() => {
        //   vcp.send(
        //     statusNotificationOcppMessage.request({
        //       connectorId: transaction.connectorId,
        //       errorCode: "NoError",
        //       status: "Available",
        //     }),
        //   );
        // }, 240000); // 4 minutes in preparing state
      }, idlePeriodMinutes * 60 * 1000); // Idle period in milliseconds
    }, 500); // 500ms delay to ensure Finishing is processed first
  };
}

export const remoteStopTransactionOcppMessage =
  new RemoteStopTransactionOcppMessage(
    "RemoteStopTransaction",
    RemoteStopTransactionReqSchema,
    RemoteStopTransactionResSchema,
  );
