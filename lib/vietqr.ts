import { stripDiacritics } from './text'

export interface VietQrBankInfo {
  bankBin: string
  accountNo: string
  accountName: string
}

/** Pure function — no network calls. Builds an img.vietqr.io quick-link URL. */
export function buildVietQrUrl(bank: VietQrBankInfo, amount: number, addInfo: string): string {
  const safeAddInfo = stripDiacritics(addInfo).replace(/[^a-zA-Z0-9 ]/g, '').trim()
  const safeAccountName = stripDiacritics(bank.accountName)

  const params = new URLSearchParams({
    amount: String(Math.round(amount)),
    addInfo: safeAddInfo,
    accountName: safeAccountName,
  })

  return `https://img.vietqr.io/image/${bank.bankBin}-${bank.accountNo}-qr_only.png?${params.toString()}`
}
