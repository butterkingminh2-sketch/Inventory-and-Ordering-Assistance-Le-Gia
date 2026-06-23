'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { groupOrdersByTable } from '@/lib/billing'
import type { TableBill } from '@/lib/billing'
import { buildVietQrUrl } from '@/lib/vietqr'
import type { OrderWithDetails, PaymentMethod } from '@/lib/types'
import { useLanguage } from '@/lib/language-context'
import { pickName } from '@/lib/language'
import { BilingualText } from '@/components/bilingual-text'

export default function RegisterPage() {
  const { t, language } = useLanguage()
  const [branchId, setBranchId] = useState<string | null>(null)
  const [bills, setBills] = useState<TableBill[]>([])
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase
        .from('user_profiles').select('branch_id').eq('id', user.id).single()
      if (profile) setBranchId(profile.branch_id)
    }
    init()
  }, [])

  const fetchBills = useCallback(async (bid: string) => {
    const { data, error } = await supabase
      .from('orders')
      .select(`*, table:tables(label), order_items(*, dish:dishes(name_vi, name_en))`)
      .eq('branch_id', bid)
      .is('paid_at', null)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: true })
    if (error) {
      setErrorMsg(t('Không thể tải danh sách bàn. Vui lòng thử lại.', 'Could not load the list of tables. Please try again.'))
      return
    }
    if (data) setBills(groupOrdersByTable(data as OrderWithDetails[], language))
  }, [supabase, t, language])

  useEffect(() => {
    if (!branchId) return
    // Initial fetch on mount/branch change — async, not a synchronous setState call.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchBills(branchId)

    const channel = supabase
      .channel(`register-orders-${branchId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `branch_id=eq.${branchId}` },
        () => fetchBills(branchId),
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [branchId, fetchBills])

  const effectiveTableId = selectedTableId ?? bills[0]?.tableId ?? null
  const selectedBill = bills.find(b => b.tableId === effectiveTableId) ?? null

  function handleSelectTable(tableId: string) {
    setSelectedTableId(tableId)
    setPaymentMethod(null)
    setErrorMsg(null)
  }

  async function handleToggleComp(itemId: string, currentlyComped: boolean) {
    if (!branchId) return
    await supabase.from('order_items').update({ comped: !currentlyComped }).eq('id', itemId)
    fetchBills(branchId)
  }

  async function handleComplete() {
    if (!selectedBill || !branchId || !paymentMethod) return

    const { data, error } = await supabase
      .from('orders')
      .update({ paid_at: new Date().toISOString(), payment_method: paymentMethod })
      .in('id', selectedBill.orderIds)
      .eq('branch_id', branchId)
      .is('paid_at', null)
      .select('id')

    if (error || !data || data.length !== selectedBill.orderIds.length) {
      setErrorMsg(t('Bàn này đã được thanh toán hoặc có lỗi xảy ra. Vui lòng thử lại.', 'This table has already been paid, or an error occurred. Please try again.'))
      fetchBills(branchId)
      return
    }

    setSelectedTableId(null)
    setPaymentMethod(null)
    setErrorMsg(null)
    fetchBills(branchId)
  }

  const bank = {
    bankBin: process.env.NEXT_PUBLIC_VIETQR_BANK_BIN ?? '',
    accountNo: process.env.NEXT_PUBLIC_VIETQR_ACCOUNT_NO ?? '',
    accountName: process.env.NEXT_PUBLIC_VIETQR_ACCOUNT_NAME ?? '',
  }
  const qrUrl = selectedBill ? buildVietQrUrl(bank, selectedBill.total, `LeGia ${selectedBill.tableLabel}`) : null

  const paymentBtn = (active: boolean) =>
    `flex-1 min-h-touch-target-min rounded-lg text-label-vi font-bold active:scale-95 transition-all ${
      active ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
    }`

  return (
    <div className="flex flex-col h-full">
      <h2 className="text-headline-md font-bold text-on-surface mb-stack-lg">
        <BilingualText vi="Thu ngân" en="Cashier" />
      </h2>

      {errorMsg && (
        <p className="text-error text-label-vi font-bold bg-error-container rounded-lg p-stack-md mb-stack-lg animate-fade-slide-up">{errorMsg}</p>
      )}

      {bills.length === 0 ? (
        <p className="text-on-surface-variant text-center mt-16 text-label-vi">{t('Không có bàn nào đang mở', 'No tables are currently open')}</p>
      ) : (
        <div className="flex-1 grid grid-cols-1 md:grid-cols-[200px_1fr_300px] gap-stack-lg min-h-0">
          {/* Table tabs */}
          <div className="flex md:flex-col gap-2 overflow-x-auto md:overflow-y-auto pb-1">
            {bills.map(bill => (
              <button
                key={bill.tableId}
                onClick={() => handleSelectTable(bill.tableId)}
                disabled={!bill.canCheckout}
                className={`text-left rounded-xl border p-stack-md min-h-touch-target-min whitespace-nowrap md:whitespace-normal transition-all ${
                  bill.tableId === effectiveTableId
                    ? 'border-primary bg-primary-fixed'
                    : bill.canCheckout
                      ? 'border-outline-variant bg-surface-container-lowest hover:border-primary'
                      : 'border-outline-variant bg-surface-container opacity-60 cursor-not-allowed'
                }`}
              >
                <div className="flex justify-between gap-2 font-bold text-label-vi text-on-surface">
                  <span>{bill.tableLabel}</span>
                  <span>{bill.total.toLocaleString('vi-VN')}đ</span>
                </div>
                {!bill.canCheckout && (
                  <BilingualText vi="Còn món chưa giao" en="Items not yet delivered" className="block text-label-en text-on-surface-variant mt-1" />
                )}
              </button>
            ))}
          </div>

          {/* Bill items */}
          <div className="overflow-y-auto rounded-xl border border-outline-variant bg-surface-container-lowest p-stack-lg">
            {selectedBill && (
              <>
                <p className="font-bold text-headline-md text-on-surface mb-stack-md">{selectedBill.tableLabel}</p>
                <div className="space-y-3">
                  {selectedBill.items.map(item => (
                    <div key={item.id} className="flex justify-between items-start text-body-lg text-on-surface">
                      <div>
                        <span className={`font-bold ${item.comped ? 'line-through text-on-surface-variant' : ''}`}>
                          {pickName(item, language)}
                        </span>
                        {item.comped && (
                          <BilingualText vi="Miễn phí" en="Free" className="ml-2 text-label-en font-bold text-secondary" />
                        )}
                        {item.toppings.map(topping => (
                          <div key={topping.id} className="flex items-center gap-2 pl-stack-md">
                            <span className={`text-label-en text-on-surface-variant ${topping.comped ? 'line-through' : ''}`}>
                              {pickName(topping, language)}{topping.qty > 1 ? ` ×${topping.qty}` : ''}
                            </span>
                            {topping.comped && <BilingualText vi="Miễn phí" en="Free" className="text-label-en font-bold text-secondary" />}
                            <button
                              onClick={() => handleToggleComp(topping.id, topping.comped)}
                              className="text-label-en text-primary hover:underline"
                            >
                              {topping.comped ? t('Hủy miễn phí', 'Undo free') : t('Miễn phí', 'Free')}
                            </button>
                          </div>
                        ))}
                        {item.note && (
                          <span className="block text-label-en text-on-surface-variant pl-stack-md">{item.note}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`font-bold ${item.comped ? 'line-through text-on-surface-variant' : ''}`}>
                          {item.lineTotal.toLocaleString('vi-VN')}đ
                        </span>
                        <button
                          onClick={() => handleToggleComp(item.id, item.comped)}
                          className="text-label-en text-primary hover:underline whitespace-nowrap"
                        >
                          {item.comped ? t('Hủy miễn phí', 'Undo free') : t('Miễn phí', 'Free')}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <hr className="border-outline-variant my-stack-lg" />
                <div className="flex justify-between text-headline-md font-black text-primary">
                  <BilingualText vi="TỔNG" en="TOTAL" />
                  <span>{selectedBill.total.toLocaleString('vi-VN')}đ</span>
                </div>
              </>
            )}
          </div>

          {/* Payment + receipt + actions */}
          <div className="flex flex-col gap-stack-lg">
            <div className="flex gap-2">
              <button onClick={() => setPaymentMethod('cash')} className={paymentBtn(paymentMethod === 'cash')}>
                {t('Tiền mặt', 'Cash')}
              </button>
              <button onClick={() => setPaymentMethod('transfer')} className={paymentBtn(paymentMethod === 'transfer')}>
                {t('Chuyển khoản', 'Bank transfer')}
              </button>
            </div>

            {selectedBill && qrUrl && (
              <div id="receipt-print-area" className="flex-1 overflow-y-auto rounded-xl border border-outline-variant bg-surface-container-lowest p-stack-lg font-mono text-[13px] text-on-surface">
                <p className="text-center font-bold">LÊ GIA - BÚN RIÊU</p>
                <p className="text-center">{new Date().toLocaleString('vi-VN')}</p>
                <p className="mt-2">{selectedBill.tableLabel}</p>
                <hr className="border-dashed border-outline-variant my-2" />
                {selectedBill.items.map(item => (
                  <div key={item.id}>
                    <div className="flex justify-between">
                      <span>{item.name_vi} x{item.qty}{item.comped ? ' (miễn phí)' : ''}</span>
                      <span>{item.comped ? '0' : item.lineTotal.toLocaleString('vi-VN')}</span>
                    </div>
                    {item.toppings.map(topping => (
                      <div key={topping.id} className="flex justify-between pl-3">
                        <span>{topping.name_vi} x{topping.qty}{topping.comped ? ' (miễn phí)' : ''}</span>
                        <span>{topping.comped ? '0' : topping.lineTotal.toLocaleString('vi-VN')}</span>
                      </div>
                    ))}
                  </div>
                ))}
                <hr className="border-dashed border-outline-variant my-2" />
                <div className="flex justify-between font-bold text-[15px]">
                  <span>TỔNG</span>
                  <span>{selectedBill.total.toLocaleString('vi-VN')}đ</span>
                </div>
                <div className="text-center mt-3">
                  <img src={qrUrl} alt="VietQR" width={160} height={160} className="mx-auto" />
                  <p className="mt-1">Quét để chuyển khoản</p>
                  <p>{bank.accountName} - {bank.accountNo}</p>
                </div>
                <p className="text-center mt-3 text-on-surface-variant">Cảm ơn quý khách!</p>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => window.print()}
                disabled={!selectedBill}
                className="flex-1 bg-surface-container text-on-surface rounded-xl py-3 text-label-vi font-bold min-h-touch-target-min disabled:opacity-50 active:scale-95 transition-transform"
              >
                {t('In hóa đơn', 'Print receipt')}
              </button>
              <button
                onClick={handleComplete}
                disabled={!selectedBill?.canCheckout || !paymentMethod}
                className="flex-1 bg-primary text-on-primary rounded-xl py-3 text-label-vi font-bold min-h-touch-target-min disabled:opacity-50 shadow-md active:scale-95 transition-transform"
              >
                {t('Hoàn tất', 'Complete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
