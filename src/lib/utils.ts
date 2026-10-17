import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatIndonesianDate(dateString?: string): string {
  if (!dateString) return '-';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    return d.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return dateString;
  }
}

export function formatShortDate(dateString?: string): string {
  if (!dateString) return '-';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    return d.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return dateString;
  }
}

export function formatCurrencyIDR(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Mendapatkan Tahun Pelajaran dari sebuah tanggal (contoh: "2025-08-15" -> "2025/2026", "2025-01-10" -> "2024/2025")
 * Di Indonesia, tahun ajaran baru dimulai bulan Juli (bulan 7) s/d Juni (bulan 6) tahun berikutnya.
 */
export function getAcademicYearFromDate(dateString?: string): string {
  if (!dateString) return '';
  const clean = dateString.trim();

  // Jika sudah berformat "YYYY/YYYY"
  if (/^\d{4}\/\d{4}$/.test(clean)) return clean;

  // Jika hanya tahun "YYYY"
  if (/^\d{4}$/.test(clean)) {
    const y = parseInt(clean, 10);
    return `${y}/${y + 1}`;
  }

  // Format YYYY-MM-DD
  const m1 = clean.match(/^(\d{4})-(\d{2})/);
  if (m1) {
    const y = parseInt(m1[1], 10);
    const m = parseInt(m1[2], 10);
    return m >= 7 ? `${y}/${y + 1}` : `${y - 1}/${y}`;
  }

  // Format DD/MM/YYYY
  const m2 = clean.match(/^\d{2}[/-](\d{2})[/-](\d{4})/);
  if (m2) {
    const m = parseInt(m2[1], 10);
    const y = parseInt(m2[2], 10);
    return m >= 7 ? `${y}/${y + 1}` : `${y - 1}/${y}`;
  }

  try {
    const d = new Date(clean);
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      return m >= 7 ? `${y}/${y + 1}` : `${y - 1}/${y}`;
    }
  } catch {
    // ignore
  }

  return '';
}

/**
 * Cek apakah tanggal atau tahun tertentu berada dalam Tahun Pelajaran tertentu (misal: "2025/2026")
 */
export function isInAcademicYear(dateOrYear?: string, targetAcademicYear?: string): boolean {
  if (!dateOrYear || !targetAcademicYear) return false;
  const cleanTarget = targetAcademicYear.trim();
  const derivedTP = getAcademicYearFromDate(dateOrYear);
  if (derivedTP && derivedTP === cleanTarget) return true;

  // Fallback direct match:
  const targetStartYear = cleanTarget.split('/')[0]?.trim();
  if (dateOrYear.trim() === targetStartYear) return true;
  if (dateOrYear.trim() === cleanTarget) return true;

  return false;
}

