import { describe, it, expect } from 'vitest'
import { buildVietQrUrl } from '../vietqr'

const bank = { bankBin: '970422', accountNo: '0123456789', accountName: 'NGUYEN VAN A' }

describe('buildVietQrUrl', () => {
  it('builds the base URL with bank bin, account number, and qr_only template', () => {
    const url = buildVietQrUrl(bank, 140000, 'LeGia Ban4')
    expect(url).toContain('https://img.vietqr.io/image/970422-0123456789-qr_only.png')
  })

  it('rounds the amount and includes it as a query param', () => {
    const url = buildVietQrUrl(bank, 139999.6, 'LeGia Ban4')
    expect(url).toContain('amount=140000')
  })

  it('strips Vietnamese diacritics from addInfo', () => {
    const url = buildVietQrUrl(bank, 100000, 'Lê Gia Bàn 4')
    expect(url).toContain('addInfo=Le+Gia+Ban+4')
  })

  it('strips diacritics from accountName, including đ/Đ which NFD does not decompose', () => {
    const url = buildVietQrUrl({ ...bank, accountName: 'Nguyễn Văn Đậu' }, 100000, 'note')
    expect(url).toContain('accountName=Nguyen+Van+Dau')
  })

  it('removes special characters from addInfo', () => {
    const url = buildVietQrUrl(bank, 100000, 'Ban#4!@2026')
    expect(url).toContain('addInfo=Ban42026')
  })
})
