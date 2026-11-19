import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../api/client';
import {
  ShoppingBag,
  Truck,
  RotateCcw,
  Ban,
  Calendar,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  ChevronRight,
  PackageCheck,
  RefreshCw,
} from 'lucide-react';
import { CommerceOrder, ShipmentDetails } from '@orbit/shared';

interface CustomerCommercePaneProps {
  conversationId?: string;
  customerId?: string;
  customerEmail?: string;
  customerPhone?: string;
  activeOrgId?: string;
}

export const CustomerCommercePane: React.FC<CustomerCommercePaneProps> = ({
  conversationId,
  customerId,
  customerEmail,
  customerPhone,
  activeOrgId,
}) => {
  const queryClient = useQueryClient();

  // Modals state
  const [selectedOrder, setSelectedOrder] = useState<CommerceOrder | null>(null);
  const [isRefundModalOpen, setIsRefundModalOpen] = useState(false);
  const [refundAmount, setRefundAmount] = useState<string>('');
  const [refundReason, setRefundReason] = useState<string>('Damaged item on arrival');

  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState<'customer' | 'inventory' | 'fraud' | 'declined' | 'other'>('customer');

  const [isNdrModalOpen, setIsNdrModalOpen] = useState(false);
  const [ndrAwb, setNdrAwb] = useState<string>('');
  const [ndrDate, setNdrDate] = useState<string>('2026-11-22');
  const [ndrRemarks, setNdrRemarks] = useState<string>('Call customer at reception before delivery');

  const [actionSuccessNotice, setActionSuccessNotice] = useState<string | null>(null);

  // Fetch orders from API
  const {
    data: orders = [],
    isLoading,
    refetch,
    isRefetching,
  } = useQuery<CommerceOrder[]>({
    queryKey: ['commerce-orders', activeOrgId, conversationId, customerId, customerEmail],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (conversationId) params.append('conversationId', conversationId);
      if (customerId) params.append('customerId', customerId);
      if (customerEmail) params.append('email', customerEmail);
      if (customerPhone) params.append('phone', customerPhone);
      const res = await apiRequest<{ success: boolean; data: CommerceOrder[] }>(
        `/api/commerce/orders?${params.toString()}`
      );
      return res.data;
    },
    enabled: !!activeOrgId && (!!conversationId || !!customerId || !!customerEmail),
  });

  // Refund Mutation
  const refundMutation = useMutation({
    mutationFn: (data: { orderId: string; amount: number; reason: string }) =>
      apiRequest(`/api/commerce/orders/${data.orderId}/refund`, {
        method: 'POST',
        body: JSON.stringify({ amount: data.amount, reason: data.reason }),
      }),
    onSuccess: () => {
      setIsRefundModalOpen(false);
      setActionSuccessNotice('Refund processed successfully');
      queryClient.invalidateQueries({ queryKey: ['commerce-orders'] });
      setTimeout(() => setActionSuccessNotice(null), 4000);
    },
  });

  // Cancel Mutation
  const cancelMutation = useMutation({
    mutationFn: (data: { orderId: string; reason: string }) =>
      apiRequest(`/api/commerce/orders/${data.orderId}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: data.reason }),
      }),
    onSuccess: () => {
      setIsCancelModalOpen(false);
      setActionSuccessNotice('Order successfully cancelled');
      queryClient.invalidateQueries({ queryKey: ['commerce-orders'] });
      setTimeout(() => setActionSuccessNotice(null), 4000);
    },
  });

  // NDR Re-attempt Mutation
  const ndrMutation = useMutation({
    mutationFn: (data: { awbNumber: string; preferredDate: string; remarks: string }) =>
      apiRequest('/api/commerce/shipments/ndr-reattempt', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      setIsNdrModalOpen(false);
      setActionSuccessNotice('Carrier re-attempt scheduled');
      queryClient.invalidateQueries({ queryKey: ['commerce-orders'] });
      setTimeout(() => setActionSuccessNotice(null), 4000);
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 text-center text-slate-400">
        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-indigo-500" />
        <p className="text-xs">Fetching Shopify orders & tracking...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 overflow-y-auto">
      {/* Header */}
      <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShoppingBag className="w-4 h-4 text-emerald-600" />
          <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
            Connected Commerce
          </span>
          <span className="text-[10px] bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-400 font-bold px-1.5 py-0.5 rounded">
            Shopify Live
          </span>
        </div>
        <button
          onClick={() => refetch()}
          title="Refresh store orders"
          className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefetching ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {actionSuccessNotice && (
        <div className="m-3 p-2.5 rounded bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>{actionSuccessNotice}</span>
        </div>
      )}

      {/* Orders List */}
      <div className="p-3 space-y-3.5">
        {orders.length === 0 ? (
          <div className="text-center py-8">
            <ShoppingBag className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto mb-2" />
            <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
              No store orders found
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              No Shopify orders matched this customer's email or phone.
            </p>
          </div>
        ) : (
          orders.map((order) => (
            <div
              key={order.id}
              className="border border-slate-200 dark:border-slate-800 rounded-lg p-3 bg-slate-50/60 dark:bg-slate-900/60 space-y-2.5 text-xs shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
            >
              {/* Order Header */}
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-900 dark:text-white text-sm">
                    {order.orderNumber}
                  </span>
                  <span className="text-[10px] text-slate-400 block">
                    {new Date(order.createdAt).toLocaleDateString()} • {order.currency} {order.totalPrice}
                  </span>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wide ${
                      order.financialStatus === 'paid'
                        ? 'bg-emerald-100 dark:bg-emerald-950/90 text-emerald-800 dark:text-emerald-400'
                        : order.financialStatus === 'refunded'
                        ? 'bg-purple-100 dark:bg-purple-950/90 text-purple-800 dark:text-purple-400'
                        : order.financialStatus === 'voided'
                        ? 'bg-rose-100 dark:bg-rose-950/90 text-rose-800 dark:text-rose-400'
                        : 'bg-amber-100 dark:bg-amber-950/90 text-amber-800 dark:text-amber-400'
                    }`}
                  >
                    {order.financialStatus}
                  </span>
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded font-semibold uppercase ${
                      order.fulfillmentStatus === 'delivered'
                        ? 'bg-emerald-50 dark:bg-emerald-900/40 text-emerald-700'
                        : order.fulfillmentStatus === 'in_transit'
                        ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-700'
                        : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {order.fulfillmentStatus}
                  </span>
                </div>
              </div>

              {/* Line Items */}
              <div className="border-t border-slate-200 dark:border-slate-800 pt-2 space-y-2">
                {order.lineItems.map((item) => (
                  <div key={item.id} className="flex items-center gap-2.5">
                    {item.thumbnailUrl ? (
                      <img
                        src={item.thumbnailUrl}
                        alt={item.title}
                        className="w-9 h-9 rounded object-cover border border-slate-200 dark:border-slate-800 shrink-0"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded bg-slate-200 dark:bg-slate-800 flex items-center justify-center shrink-0">
                        <ShoppingBag className="w-4 h-4 text-slate-400" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-800 dark:text-slate-200 truncate leading-tight">
                        {item.title}
                      </p>
                      <p className="text-[10px] text-slate-500">
                        Qty: {item.quantity} • ${item.price}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Courier Shipment Details */}
              {order.shipment && (
                <div className="border-t border-slate-200 dark:border-slate-800 pt-2 bg-indigo-50/50 dark:bg-indigo-950/20 p-2 rounded">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 text-[11px]">
                      <Truck className="w-3.5 h-3.5 text-indigo-600" />
                      {order.shipment.carrier}
                    </span>
                    <span
                      className={`text-[9px] px-1 py-0.5 rounded font-bold uppercase ${
                        order.shipment.status === 'DELIVERED'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300'
                          : order.shipment.status === 'NDR_EXCEPTION'
                          ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-300'
                          : 'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300'
                      }`}
                    >
                      {order.shipment.status}
                    </span>
                  </div>
                  <p className="text-[10px] font-mono text-slate-500">
                    AWB: {order.shipment.awbNumber}
                  </p>
                  {order.shipment.lastLocation && (
                    <p className="text-[10px] text-slate-600 dark:text-slate-400 mt-0.5">
                      Last loc: {order.shipment.lastLocation}
                    </p>
                  )}

                  {/* NDR Action Button */}
                  {order.shipment.status === 'NDR_EXCEPTION' && (
                    <button
                      onClick={() => {
                        setNdrAwb(order.shipment!.awbNumber);
                        setIsNdrModalOpen(true);
                      }}
                      className="mt-2 w-full py-1 px-2 rounded bg-amber-500 hover:bg-amber-600 text-white font-semibold text-[10px] flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Schedule NDR Carrier Re-Attempt
                    </button>
                  )}
                </div>
              )}

              {/* Action Buttons: Refund & Cancel */}
              <div className="border-t border-slate-200 dark:border-slate-800 pt-2 flex items-center gap-2">
                {order.financialStatus !== 'voided' && (
                  <button
                    onClick={() => {
                      setSelectedOrder(order);
                      setCancelReason('customer');
                      setIsCancelModalOpen(true);
                    }}
                    className="flex-1 py-1 px-2 border border-slate-300 dark:border-slate-700 hover:border-rose-300 dark:hover:border-rose-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-700 dark:text-slate-300 hover:text-rose-700 rounded text-[11px] font-medium flex items-center justify-center gap-1 transition-colors"
                  >
                    <Ban className="w-3 h-3" />
                    Cancel
                  </button>
                )}

                {order.financialStatus === 'paid' && (
                  <button
                    onClick={() => {
                      setSelectedOrder(order);
                      setRefundAmount(order.totalPrice);
                      setIsRefundModalOpen(true);
                    }}
                    className="flex-1 py-1 px-2 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 rounded text-[11px] font-medium flex items-center justify-center gap-1 transition-colors"
                  >
                    <DollarSign className="w-3 h-3" />
                    Refund
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Refund Modal */}
      {isRefundModalOpen && selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl max-w-sm w-full p-5 border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
            <h4 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-indigo-600" />
              Issue Shopify Refund
            </h4>
            <p className="text-xs text-slate-500">
              Issuing refund for order <span className="font-mono font-semibold">{selectedOrder.orderNumber}</span> (Total: ${selectedOrder.totalPrice})
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-medium text-slate-700 dark:text-slate-300 block mb-1">
                  Refund Amount ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  max={selectedOrder.totalPrice}
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="font-medium text-slate-700 dark:text-slate-300 block mb-1">
                  Reason for Refund
                </label>
                <select
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                >
                  <option value="Damaged item on arrival">Damaged item on arrival</option>
                  <option value="Customer returned item">Customer returned item</option>
                  <option value="Package lost by courier">Package lost by courier</option>
                  <option value="Customer courtesy goodwill">Customer courtesy goodwill</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setIsRefundModalOpen(false)}
                className="px-3 py-1.5 rounded text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Dismiss
              </button>
              <button
                disabled={refundMutation.isPending}
                onClick={() =>
                  refundMutation.mutate({
                    orderId: selectedOrder.id,
                    amount: parseFloat(refundAmount),
                    reason: refundReason,
                  })
                }
                className="px-3 py-1.5 rounded text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {refundMutation.isPending ? 'Processing...' : 'Confirm Refund'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Modal */}
      {isCancelModalOpen && selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl max-w-sm w-full p-5 border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
            <h4 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
              <Ban className="w-4 h-4 text-rose-600" />
              Cancel Shopify Order
            </h4>
            <p className="text-xs text-slate-500">
              Are you sure you want to void order <span className="font-mono font-semibold">{selectedOrder.orderNumber}</span>?
            </p>

            <div>
              <label className="font-medium text-slate-700 dark:text-slate-300 block mb-1 text-xs">
                Cancellation Reason
              </label>
              <select
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value as any)}
                className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs"
              >
                <option value="customer">Customer requested cancellation</option>
                <option value="inventory">Out of stock / inventory issue</option>
                <option value="fraud">Suspected fraud or payment chargeback risk</option>
                <option value="declined">Payment declined</option>
                <option value="other">Other reason</option>
              </select>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setIsCancelModalOpen(false)}
                className="px-3 py-1.5 rounded text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Keep Order
              </button>
              <button
                disabled={cancelMutation.isPending}
                onClick={() =>
                  cancelMutation.mutate({
                    orderId: selectedOrder.id,
                    reason: cancelReason,
                  })
                }
                className="px-3 py-1.5 rounded text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white"
              >
                {cancelMutation.isPending ? 'Cancelling...' : 'Void & Cancel Order'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NDR Modal */}
      {isNdrModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl max-w-sm w-full p-5 border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
            <h4 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
              <Truck className="w-4 h-4 text-amber-500" />
              Schedule Courier NDR Re-Attempt
            </h4>
            <p className="text-xs text-slate-500">
              Submit instruction to Shiprocket / FedEx carrier for AWB <span className="font-mono font-semibold">{ndrAwb}</span>.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-medium text-slate-700 dark:text-slate-300 block mb-1">
                  Preferred Delivery Date
                </label>
                <input
                  type="date"
                  value={ndrDate}
                  onChange={(e) => setNdrDate(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="font-medium text-slate-700 dark:text-slate-300 block mb-1">
                  Carrier Delivery Instructions
                </label>
                <textarea
                  rows={2}
                  value={ndrRemarks}
                  onChange={(e) => setNdrRemarks(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setIsNdrModalOpen(false)}
                className="px-3 py-1.5 rounded text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Dismiss
              </button>
              <button
                disabled={ndrMutation.isPending}
                onClick={() =>
                  ndrMutation.mutate({
                    awbNumber: ndrAwb,
                    preferredDate: ndrDate,
                    remarks: ndrRemarks,
                  })
                }
                className="px-3 py-1.5 rounded text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white"
              >
                {ndrMutation.isPending ? 'Scheduling...' : 'Confirm Re-Attempt'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
