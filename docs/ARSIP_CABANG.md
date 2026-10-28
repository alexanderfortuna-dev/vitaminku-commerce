# Arsip cabang (dicatat 2026-10-28)

Cabang di bawah ini sudah digantikan oleh rangkaian Rilis 2 sampai 5 (PR #12). Cabangnya **tidak dihapus**. Tag arsip tidak bisa dibuat dari sesi agen karena akses tulis ke referensi Git dibatasi, jadi SHA terakhirnya dicatat di sini sebagai pengganti.

| Cabang | SHA terakhir | PR | Status |
|---|---|---|---|
| `feat/own-stack-v2` | `7ba64e6` | #1 | Ditutup, digantikan |
| `feat/launch-ready-v3` | `db7f897` | #2 | Ditutup, digantikan |
| `fix/vitaminku-hardening-v1` | `2ec53e5` | #8 | Ditutup, digantikan |
| `develop` | `db7f897` | - | Sama dengan `feat/launch-ready-v3`, tidak dipakai |

Cara membuat tag sendiri bila diinginkan (satu kali, oleh pemilik repo):
`git tag arsip/feat/own-stack-v2 7ba64e6 && git push origin arsip/feat/own-stack-v2`, dan seterusnya untuk baris lain.

Cabang aktif untuk rilis: `claude/vk-rilis6-penutup` (memuat riwayat Rilis 1 sampai 5). Cabang `main` masih berisi kode Lovable lama dan tidak boleh menjadi sumber produksi.
