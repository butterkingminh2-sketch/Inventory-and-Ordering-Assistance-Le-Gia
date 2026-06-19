'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { groupOrdersByTable } from '@/lib/billing'
import type { TableBill, TableBillItem } from '@/lib/billing'
import { buildVietQrUrl } from '@/lib/vietqr'
import type { OrderWithDetails } from '@/lib/types'

type Step = 'list' | 'confirm' | 'receipt'

interface Receipt {
  tableLabel: string
  items: TableBillItem[]
  total: number
  paidAt: string
}

export default function RegisterPage() {
  const [branchId, setBranchId] = useState<string | null>(null)
  const [bills, setBills] = useState<TableBill[]>([])
  const [step, setStep] = useState<Step>('list')
  const [selectedBill, setSelectedBill] = useState<TableBill | null>(null)
  const [receipt, setReceipt] = useState<Receipt | null>(null)
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
    const { data } = await supabase
      .from('orders')
      .select(`*, table:tables(label), order_items(*, dish:dishes(name_vi, name_en))`)
      .eq('branch_id', bid)
      .is('paid_at', null)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: true })
    if (data) setBills(groupOrdersByTable(data as OrderWithDetails[]))
  }, [supabase])

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

  function handleSelectTable(bill: TableBill) {
    if (!bill.canCheckout) return
    setSelectedBill(bill)
    setErrorMsg(null)
    setStep('confirm')
  }

  async function handleConfirmPay() {
    if (!selectedBill || !branchId) return

    const { data, error } = await supabase
      .from('orders')
      .update({ paid_at: new Date().toISOString() })
      .eq('table_id', selectedBill.tableId)
      .eq('branch_id', branchId)
      .is('paid_at', null)
      .select('id')

    if (error || !data || data.length === 0) {
      setErrorMsg('Bàn này đã được thanh toán hoặc có lỗi xảy ra. Vui lòng thử lại.')
      setStep('list')
      setSelectedBill(null)
      fetchBills(branchId)
      return
    }

    setReceipt({
      tableLabel: selectedBill.tableLabel,
      items: selectedBill.items,
      total: selectedBill.total,
      paidAt: new Date().toLocaleString('vi-VN'),
    })
    setStep('receipt')
  }

  function handleBackToList() {
    setSelectedBill(null)
    setReceipt(null)
    setErrorMsg(null)
    setStep('list')
    if (branchId) fetchBills(branchId)
  }

  if (step === 'confirm' && selectedBill) {
    return (
      <div className="max-w-lg mx-auto">
        <div className="flex items-center gap-3 mb-stack-lg">
          <button onClick={handleBackToList} className="text-primary text-label-vi font-bold flex items-center gap-1">
            <span className="material-symbols-outlined text-[18px]" aria-hidden>arrow_back</span>
            Bàn
          </button>
          <h2 className="text-headline-md font-bold text-on-surface">{selectedBill.tableLabel}</h2>
        </div>

        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-stack-lg mb-stack-lg space-y-2">
          {selectedBill.items.map((item, i) => (
            <div key={i} className="flex justify-between text-body-lg text-on-surface">
              <span>{item.name_vi} ×{item.qty}</span>
              <span className="font-bold">{item.lineTotal.toLocaleString('vi-VN')}đ</span>
            </div>
          ))}
          <hr className="border-outline-variant" />
          <div className="flex justify-between text-headline-md font-black text-primary">
            <span>TỔNG</span>
            <span>{selectedBill.total.toLocaleString('vi-VN')}đ</span>
          </div>
        </div>

        <button
          onClick={handleConfirmPay}
          className="w-full bg-primary text-on-primary rounded-xl py-3 text-label-vi font-bold min-h-touch-target-min shadow-md"
        >
          Xác nhận thanh toán
        </button>
      </div>
    )
  }

  if (step === 'receipt' && receipt) {
    const bank = {
      bankBin: process.env.NEXT_PUBLIC_VIETQR_BANK_BIN ?? '',
      accountNo: process.env.NEXT_PUBLIC_VIETQR_ACCOUNT_NO ?? '',
      accountName: process.env.NEXT_PUBLIC_VIETQR_ACCOUNT_NAME ?? '',
    }
    const qrUrl = buildVietQrUrl(bank, receipt.total, `LeGia ${receipt.tableLabel}`)

    return (
      <div className="max-w-sm mx-auto">
        <div id="receipt-print-area" className="rounded-xl border border-outline-variant bg-surface-container-lowest p-stack-lg font-mono text-[13px] text-on-surface">
          <p className="text-center font-bold">LÊ GIA - BÚN RIÊU</p>
          <p className="text-center">{receipt.paidAt}</p>
          <p className="mt-2">{receipt.tableLabel}</p>
          <hr className="border-dashed border-outline-variant my-2" />
          {receipt.items.map((item, i) => (
            <div key={i} className="flex justify-between">
              <span>{item.name_vi} x{item.qty}</span>
              <span>{item.lineTotal.toLocaleString('vi-VN')}</span>
            </div>
          ))}
          <hr className="border-dashed border-outline-variant my-2" />
          <div className="flex justify-between font-bold text-[15px]">
            <span>TỔNG</span>
            <span>{receipt.total.toLocaleString('vi-VN')}đ</span>
          </div>
          <div className="text-center mt-3">
            <img src={qrUrl} alt="VietQR" width={160} height={160} className="mx-auto" />
            <p className="mt-1">Quét để chuyển khoản</p>
            <p>{bank.accountName} - {bank.accountNo}</p>
          </div>
          <p className="text-center mt-3 text-on-surface-variant">Cảm ơn quý khách!</p>
        </div>

        <div className="flex gap-2 mt-stack-lg">
          <button
            onClick={() => window.print()}
            className="flex-1 bg-primary text-on-primary rounded-xl py-3 text-label-vi font-bold min-h-touch-target-min"
          >
            In hóa đơn
          </button>
          <button
            onClick={handleBackToList}
            className="flex-1 bg-surface-container text-on-surface rounded-xl py-3 text-label-vi font-bold min-h-touch-target-min"
          >
            Xong
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto space-y-stack-md">
      <h2 className="text-headline-md font-bold text-on-surface mb-stack-lg">
        Thu ngân
        <span className="block text-label-en font-normal text-on-surface-variant">Register</span>
      </h2>

      {errorMsg && (
        <p className="text-error text-label-vi font-bold bg-error-container rounded-lg p-stack-md">{errorMsg}</p>
      )}

      {bills.length === 0 && (
        <p className="text-on-surface-variant text-center mt-16 text-label-vi">Không có bàn nào đang mở</p>
      )}

      {bills.map(bill => (
        <button
          key={bill.tableId}
          onClick={() => handleSelectTable(bill)}
          disabled={!bill.canCheckout}
          className={`w-full text-left rounded-xl border p-stack-lg transition-all ${
            bill.canCheckout
              ? 'border-outline-variant bg-surface-container-lowest hover:border-primary'
              : 'border-outline-variant bg-surface-container opacity-60 cursor-not-allowed'
          }`}
        >
          <div className="flex justify-between font-bold text-body-lg text-on-surface">
            <span>{bill.tableLabel}</span>
            <span>{bill.total.toLocaleString('vi-VN')}đ</span>
          </div>
          <p className="text-label-en text-on-surface-variant mt-1">
            {bill.canCheckout
              ? `${bill.items.length} món · Tất cả đã giao`
              : 'Còn món chưa giao — chưa thể thanh toán'}
          </p>
        </button>
      ))}
    </div>
  )
}
