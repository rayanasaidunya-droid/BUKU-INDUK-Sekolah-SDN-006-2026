import React, { useState, useMemo } from 'react';
import { 
  UserCheck, 
  Users, 
  Edit3, 
  UserPlus, 
  UserMinus, 
  Table, 
  BarChart2, 
  Search, 
  Filter, 
  Printer, 
  Download, 
  Eye, 
  CreditCard, 
  BookOpen, 
  ChevronLeft, 
  ChevronRight, 
  Calendar, 
  Building2, 
  CheckCircle2, 
  AlertTriangle, 
  GraduationCap, 
  Sparkles,
  ArrowRight,
  School,
  FileSpreadsheet,
  FileCheck,
  RefreshCw,
  Save,
  Clock,
  MapPin,
  HeartPulse,
  ArrowUpDown,
  Upload,
  ArrowRightLeft,
  Layers
} from 'lucide-react';
import { useSchool, sanitizeDiterimaDiKelas } from '../../context/SchoolContext';
import { Student, Gender, MutationRecord } from '../../types';
import { formatIndonesianDate, cn, isInAcademicYear, getAcademicYearFromDate } from '../../lib/utils';
import { OfficialNationalLogo, TutWuriHandayaniSDLogo } from '../../utils/logoHelper';
import { downloadRombelTemplate } from '../../utils/excelHelper';
import { ImportRombelModal } from '../modals/ImportRombelModal';
import { ManageClassesModal } from '../modals/ManageClassesModal';
import { ActiveTab } from '../layout/Sidebar';

export type ActiveStudentsSubTab = 
  | 'daftar' 
  | 'edit' 
  | 'mutasi-masuk' 
  | 'mutasi-keluar' 
  | 'tabel-rombel' 
  | 'gender';

interface ActiveStudentsViewProps {
  onOpenAddModal: () => void;
  onEditStudent: (student: Student, initialTab?: 'pribadi' | 'alamat' | 'ortu' | 'kesehatan' | 'masuk') => void;
  onSelectDetail: (studentId: string) => void;
  onPrintBukuInduk: (studentId: string) => void;
  onPrintKartuPelajar: (studentId: string) => void;
  onMutasi: (student: Student) => void;
  onSTTB?: (student: Student) => void;
  onRaport?: (student: Student) => void;
  setActiveTab?: (tab: ActiveTab) => void;
  onBack?: () => void;
}

/**
 * Helper: Cek apakah kelas berada di tingkat 1 sampai dengan 6 (Sekolah Dasar)
 */
export const isKelas1Sampai6 = (kelasName?: string): boolean => {
  if (!kelasName) return false;
  const k = kelasName.trim().toLowerCase();

  // Exclude non-SD levels explicitly
  if (
    k.includes('alumni') || 
    k.includes('lulus') || 
    k.includes('tamat') || 
    k.includes('tk') || 
    k.includes('paud') || 
    k.includes('kb') ||
    k.includes('tpa') ||
    k.includes('ra') ||
    k.includes('smp') ||
    k.includes('mts') ||
    k.includes('sma') ||
    k.includes('smk')
  ) {
    return false;
  }

  // Exclude secondary grades: 7, 8, 9, 10, 11, 12, VII, VIII, IX, X, XI, XII
  if (/\b(?:kelas|tingkat|rombel)?\s*(?:7|8|9|10|11|12|vii|viii|ix|x|xi|xii)\b/i.test(k)) {
    return false;
  }

  // Check for digits 1-6 (e.g. "Kelas 1", "Kelas 1A", "1B", "Kelas 2", "3-A", "Kelas 6", "6B")
  if (/\b(?:kelas|tingkat|rombel)?\s*([1-6])(?![0-9])/i.test(k)) {
    return true;
  }

  // Check for Roman numerals I-VI (e.g. "Kelas I", "Kelas II-A", "VI", etc.)
  if (/\b(?:kelas|tingkat|rombel)?\s*(vi|v|iv|iii|ii|i)\b/i.test(k)) {
    return true;
  }

  return false;
};

/**
 * Helper: Mengambil nomor tingkat 1 s/d 6 untuk pengelompokan & sorting
 */
export const getTingkatKelasNumber = (kelasName?: string): number => {
  if (!kelasName) return 1;
  const k = kelasName.trim().toLowerCase();

  const numMatch = k.match(/(?:kelas|tingkat|rombel)?\s*([1-6])(?![0-9])/i);
  if (numMatch) return parseInt(numMatch[1], 10);

  if (/\bvi\b/i.test(k)) return 6;
  if (/\bv\b/i.test(k)) return 5;
  if (/\biv\b/i.test(k)) return 4;
  if (/\biii\b/i.test(k)) return 3;
  if (/\bii\b/i.test(k)) return 2;
  if (/\bi\b/i.test(k)) return 1;

  return 1;
};

export const ActiveStudentsView: React.FC<ActiveStudentsViewProps> = ({
  onOpenAddModal,
  onEditStudent,
  onSelectDetail,
  onPrintBukuInduk,
  onPrintKartuPelajar,
  onMutasi,
  onSTTB,
  onRaport,
  setActiveTab,
  onBack,
}) => {
  const { 
    students, 
    schoolProfile, 
    currentRole, 
    updateStudent, 
    addStudent, 
    processMutation, 
    logActivity,
    exportStudentsCSV 
  } = useSchool();

  // Active sub-tab state
  const [subTab, setSubTab] = useState<ActiveStudentsSubTab>('daftar');

  // Filter, search, and sorting state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClass, setSelectedClass] = useState<string>('ALL');
  const [selectedGender, setSelectedGender] = useState<'ALL' | 'L' | 'P'>('ALL');
  const [sortBy, setSortBy] = useState<'nis' | 'nama' | 'kelas' | 'tanggal'>('nis');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;

  // Active School Year
  const activeTP = schoolProfile.tahunPelajaranAktif || '2025/2026';
  const activeSemester = schoolProfile.semesterAktif || 'Ganjil';

  // Exclusively Active Students in Grade 1 to 6 (Kelas 1 s/d Kelas 6, Rombel Tetap Variabel)
  const activeStudents = useMemo(() => {
    return students.filter(s => s.status === 'Aktif' && isKelas1Sampai6(s.kelasSekarang));
  }, [students]);

  // Modal Import Rombel & Download Template State
  const [isImportRombelModalOpen, setIsImportRombelModalOpen] = useState(false);
  const [isTemplateDropdownOpen, setIsTemplateDropdownOpen] = useState(false);
  const [isManageClassesOpen, setIsManageClassesOpen] = useState(false);

  const handleDownloadPopulatedTemplate = () => {
    downloadRombelTemplate(schoolProfile.namaSekolah, activeStudents, 'populated');
    setIsTemplateDropdownOpen(false);
  };

  const handleDownloadBlankTemplate = () => {
    downloadRombelTemplate(schoolProfile.namaSekolah, [], 'blank');
    setIsTemplateDropdownOpen(false);
  };

  // Available variable classes for Kelas 1 to 6 (Rombel Variabel)
  const availableClasses = useMemo(() => {
    const fromProfile = (schoolProfile.daftarKelas || []).filter(isKelas1Sampai6);
    const fromStudents = activeStudents.map(s => s.kelasSekarang).filter(isKelas1Sampai6);
    const baseList = fromProfile.length > 0 ? fromProfile : ['Kelas 1', 'Kelas 2', 'Kelas 3', 'Kelas 4', 'Kelas 5', 'Kelas 6'];
    const combined = Array.from(new Set([...baseList, ...fromStudents]));

    return combined.sort((a, b) => {
      const tingkatA = getTingkatKelasNumber(a);
      const tingkatB = getTingkatKelasNumber(b);
      if (tingkatA !== tingkatB) return tingkatA - tingkatB;
      return a.localeCompare(b, undefined, { numeric: true });
    });
  }, [schoolProfile.daftarKelas, activeStudents]);

  // Filtered students for Daftar tab with support for Tingkat (1-6) or specific variable rombel and sorting
  const filteredActiveStudents = useMemo(() => {
    return activeStudents.filter(s => {
      const matchSearch = searchQuery.trim() === '' || 
        s.namaLengkap.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.noInduk.includes(searchQuery) ||
        s.nisn.includes(searchQuery) ||
        (s.nik && s.nik.includes(searchQuery));

      let matchClass = true;
      if (selectedClass === 'ALL') {
        matchClass = true;
      } else if (selectedClass.startsWith('TINGKAT_')) {
        const targetTingkat = parseInt(selectedClass.replace('TINGKAT_', ''), 10);
        matchClass = getTingkatKelasNumber(s.kelasSekarang) === targetTingkat;
      } else {
        matchClass = s.kelasSekarang === selectedClass;
      }

      const matchGender = selectedGender === 'ALL' || s.jenisKelamin === selectedGender;

      return matchSearch && matchClass && matchGender;
    }).sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'nama') {
        comparison = a.namaLengkap.localeCompare(b.namaLengkap);
      } else if (sortBy === 'nis') {
        comparison = a.noInduk.localeCompare(b.noInduk, undefined, { numeric: true });
      } else if (sortBy === 'kelas') {
        const tingkatA = getTingkatKelasNumber(a.kelasSekarang);
        const tingkatB = getTingkatKelasNumber(b.kelasSekarang);
        if (tingkatA !== tingkatB) {
          comparison = tingkatA - tingkatB;
        } else {
          comparison = a.kelasSekarang.localeCompare(b.kelasSekarang, undefined, { numeric: true });
        }
      } else if (sortBy === 'tanggal') {
        const dateA = a.tanggalDiterima ? new Date(a.tanggalDiterima).getTime() : new Date(a.createdAt).getTime();
        const dateB = b.tanggalDiterima ? new Date(b.tanggalDiterima).getTime() : new Date(b.createdAt).getTime();
        comparison = dateA - dateB;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [activeStudents, searchQuery, selectedClass, selectedGender, sortBy, sortOrder]);

  // Pagination for Daftar tab
  const totalPages = Math.ceil(filteredActiveStudents.length / itemsPerPage) || 1;
  const paginatedStudents = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredActiveStudents.slice(start, start + itemsPerPage);
  }, [filteredActiveStudents, currentPage, itemsPerPage]);

  // Summary Metrics
  const totalActive = activeStudents.length;
  const totalLaki = activeStudents.filter(s => s.jenisKelamin === 'L').length;
  const totalPerempuan = activeStudents.filter(s => s.jenisKelamin === 'P').length;
  const persenLaki = totalActive > 0 ? Math.round((totalLaki / totalActive) * 100) : 0;
  const persenPerempuan = totalActive > 0 ? (100 - persenLaki) : 0;

  // ==========================================
  // TAB 2: INLINE QUICK EDIT STATE
  // ==========================================
  const [selectedStudentForEditId, setSelectedStudentForEditId] = useState<string>(() => {
    return activeStudents[0]?.id || '';
  });

  const selectedStudentForEdit = useMemo(() => {
    return activeStudents.find(s => s.id === selectedStudentForEditId) || activeStudents[0] || null;
  }, [activeStudents, selectedStudentForEditId]);

  // Local form state for inline edit tab
  const [editFormData, setEditFormData] = useState<Partial<Student>>({});
  const [editSaveSuccess, setEditSaveSuccess] = useState(false);

  // Sync edit form whenever selected student changes
  React.useEffect(() => {
    if (selectedStudentForEdit) {
      setEditFormData({
        namaLengkap: selectedStudentForEdit.namaLengkap,
        namaPanggilan: selectedStudentForEdit.namaPanggilan,
        noInduk: selectedStudentForEdit.noInduk,
        nisn: selectedStudentForEdit.nisn,
        nik: selectedStudentForEdit.nik,
        jenisKelamin: selectedStudentForEdit.jenisKelamin,
        tempatLahir: selectedStudentForEdit.tempatLahir,
        tanggalLahir: selectedStudentForEdit.tanggalLahir,
        agama: selectedStudentForEdit.agama,
        kelasSekarang: selectedStudentForEdit.kelasSekarang,
        diterimaDiKelas: (() => {
          const raw = selectedStudentForEdit.diterimaDiKelas;
          if (!raw || raw === '7' || raw === '7A' || raw === '7B' || raw.toLowerCase() === 'kelas 7' || raw.toLowerCase() === 'vii') {
            return 'Kelas 1';
          }
          return raw || selectedStudentForEdit.kelasSekarang || 'Kelas 1';
        })(),
        sekolahAsalTK: selectedStudentForEdit.sekolahAsalTK || '',
        noIjazahTK: selectedStudentForEdit.noIjazahTK || '',
        tanggalDiterima: selectedStudentForEdit.tanggalDiterima || '',
        tahunMasuk: selectedStudentForEdit.tahunMasuk || '',
        status: selectedStudentForEdit.status,
      });
      setEditSaveSuccess(false);
    }
  }, [selectedStudentForEdit?.id]);

  // Edit navigation index
  const editIndex = activeStudents.findIndex(s => s.id === selectedStudentForEdit?.id);
  const hasPrevEdit = editIndex > 0;
  const hasNextEdit = editIndex >= 0 && editIndex < activeStudents.length - 1;

  const handlePrevEditStudent = () => {
    if (hasPrevEdit) {
      setSelectedStudentForEditId(activeStudents[editIndex - 1].id);
    }
  };

  const handleNextEditStudent = () => {
    if (hasNextEdit) {
      setSelectedStudentForEditId(activeStudents[editIndex + 1].id);
    }
  };

  const handleSaveInlineEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudentForEdit) return;

    const cleanedDiterima = sanitizeDiterimaDiKelas(editFormData.diterimaDiKelas);

    updateStudent(selectedStudentForEdit.id, {
      ...editFormData,
      diterimaDiKelas: cleanedDiterima,
    });
    logActivity('EDIT', `Memperbarui data & riwayat masuk siswa aktif: ${selectedStudentForEdit.namaLengkap} (${selectedStudentForEdit.noInduk})`);
    setEditSaveSuccess(true);
    setTimeout(() => setEditSaveSuccess(false), 3000);
  };

  // ==========================================
  // TAB 3: MUTASI MASUK (Incoming Transfer)
  // ==========================================
  const [mutasiMasukForm, setMutasiMasukForm] = useState({
    namaLengkap: '',
    jenisKelamin: 'L' as Gender,
    nisn: '',
    noInduk: '',
    nik: '',
    tempatLahir: schoolProfile.desaKelurahan || 'Sungai Buluh',
    tanggalLahir: '2016-01-01',
    agama: 'Islam' as const,
    sekolahAsal: '',
    diterimaDiKelas: 'Kelas 2',
    tanggalMasuk: new Date().toISOString().split('T')[0],
    noSuratPindah: '',
    alasanPindah: 'Pindah Domisili Orang Tua',
    namaAyah: '',
    noHpOrtu: '',
    alamat: `Dusun Suka Maju, Desa ${schoolProfile.desaKelurahan || 'Sungai Buluh'}`,
  });
  const [mutasiMasukSuccess, setMutasiMasukSuccess] = useState(false);

  // Filter mutasi khusus Tahun Ajar Aktif (sesuai instruksi: "tampilkan mutasi data siswa mutasi masuk dan mutasi keluar pada tahun Ajar Aktif. selain tahun itu di sembunyikan")
  const [filterMutasiOnlyActiveYear, setFilterMutasiOnlyActiveYear] = useState<boolean>(true);

  // Helper untuk mengenali apakah siswa masuk lewat mutasi masuk / pindahan
  const isStudentMutasiMasuk = (s: Student): boolean => {
    const rawClass = (s.diterimaDiKelas || '').trim();
    // Jika isian sebelumnya '7', '7A', 'Kelas 7', anggap sebagai 'Kelas 1' (bukan mutasi masuk)
    const isKelas1 = !rawClass || rawClass === '7' || rawClass === '7A' || rawClass === '7B' || rawClass.toLowerCase().includes('kelas 1') || rawClass.toLowerCase().startsWith('1');
    const isNotClass1 = !isKelas1;
    const isSekolahAsalSD = Boolean(s.sekolahAsalTK && (
      s.sekolahAsalTK.toLowerCase().includes('sd') ||
      s.sekolahAsalTK.toLowerCase().includes('mi') ||
      s.sekolahAsalTK.toLowerCase().includes('sekolah dasar') ||
      s.sekolahAsalTK.toLowerCase().includes('pindahan')
    ));
    const hasTransferSurat = Boolean(s.noIjazahTK && (
      s.noIjazahTK.toLowerCase().includes('skp') || 
      s.noIjazahTK.toLowerCase().includes('pindah') ||
      s.noIjazahTK.toLowerCase().includes('mutasi')
    ));
    return isNotClass1 || isSekolahAsalSD || hasTransferSurat;
  };

  // Semua riwayat mutasi masuk (seluruh tahun)
  const allMutasiMasukStudents = useMemo(() => {
    return activeStudents.filter(isStudentMutasiMasuk);
  }, [activeStudents]);

  // Siswa mutasi masuk khusus pada Tahun Ajar Aktif (selain tahun aktif disembunyikan)
  const studentsMutasiMasuk = useMemo(() => {
    if (!filterMutasiOnlyActiveYear) return allMutasiMasukStudents;
    return allMutasiMasukStudents.filter(s => {
      return isInAcademicYear(s.tanggalDiterima, activeTP) || 
             (s.tahunMasuk && isInAcademicYear(s.tahunMasuk, activeTP));
    });
  }, [allMutasiMasukStudents, activeTP, filterMutasiOnlyActiveYear]);

  // Jumlah siswa mutasi masuk tahun lain yang disembunyikan
  const hiddenMutasiMasukCount = allMutasiMasukStudents.length - studentsMutasiMasuk.length;

  const handleSubmitMutasiMasuk = (e: React.FormEvent) => {
    e.preventDefault();
    if (!mutasiMasukForm.namaLengkap.trim()) {
      alert('Nama lengkap siswa mutasi masuk wajib diisi.');
      return;
    }

    const currentYear = new Date().getFullYear();
    const newStudentData: Omit<Student, 'id' | 'createdAt' | 'updatedAt'> = {
      namaLengkap: mutasiMasukForm.namaLengkap.trim(),
      namaPanggilan: mutasiMasukForm.namaLengkap.trim().split(' ')[0],
      jenisKelamin: mutasiMasukForm.jenisKelamin,
      noInduk: mutasiMasukForm.noInduk.trim() || `${currentYear}${String(activeStudents.length + 1).padStart(3, '0')}`,
      nisn: mutasiMasukForm.nisn.trim() || `0${Math.floor(100000000 + Math.random() * 900000000)}`,
      nik: mutasiMasukForm.nik.trim() || '1409050000000000',
      tempatLahir: mutasiMasukForm.tempatLahir,
      tanggalLahir: mutasiMasukForm.tanggalLahir,
      agama: mutasiMasukForm.agama,
      kewarganegaraan: 'Indonesia (WNI)',
      anakKe: 1,
      jumlahSaudaraKandung: 0,
      jumlahSaudaraTiri: 0,
      jumlahSaudaraAngkat: 0,
      statusKeluarga: 'Anak Kandung',
      bahasaIbu: 'Bahasa Indonesia',
      alamat: mutasiMasukForm.alamat,
      rt: '001',
      rw: '001',
      dusun: 'Dusun Suka Maju',
      kelurahanDesa: schoolProfile.desaKelurahan || 'Sungai Buluh',
      kecamatan: schoolProfile.kecamatan || 'Singingi Hilir',
      kabupatenKota: schoolProfile.kabupatenKota || 'Kabupaten Kuantan Singingi',
      provinsi: schoolProfile.provinsi || 'Riau',
      kodePos: schoolProfile.kodePos || '29563',
      tinggalDengan: 'Orang Tua',
      jarakKeSekolahKm: 1,
      transportasi: 'Sepeda Motor',
      kesehatan: {
        golonganDarah: 'Tidak Tahu',
        penyakitPernahDiderita: '-',
        kelainanJasmani: '-',
        tinggiBadanCm: 125,
        beratBadanKg: 26,
      },
      ayah: {
        nama: mutasiMasukForm.namaAyah || 'Orang Tua Siswa',
        nik: '1409050000000001',
        agama: 'Islam',
        kewarganegaraan: 'WNI',
        pendidikan: 'SMA/Sederajat',
        pekerjaan: 'Wiraswasta / Karyawan',
        penghasilanBulanan: 'Rp 2.000.000 - Rp 4.000.000',
        noHp: mutasiMasukForm.noHpOrtu,
        statusHidup: 'Masih Hidup',
      },
      ibu: {
        nama: 'Ibu Siswa',
        nik: '1409050000000002',
        agama: 'Islam',
        kewarganegaraan: 'WNI',
        pendidikan: 'SMA/Sederajat',
        pekerjaan: 'Ibu Rumah Tangga',
        penghasilanBulanan: 'Kurang dari Rp 1.000.000',
        noHp: mutasiMasukForm.noHpOrtu,
        statusHidup: 'Masih Hidup',
      },
      sekolahAsalTK: mutasiMasukForm.sekolahAsal || 'SD Asal Pindahan',
      noIjazahTK: mutasiMasukForm.noSuratPindah || '',
      tanggalDiterima: mutasiMasukForm.tanggalMasuk,
      diterimaDiKelas: mutasiMasukForm.diterimaDiKelas,
      kelasSekarang: mutasiMasukForm.diterimaDiKelas,
      status: 'Aktif',
      tahunMasuk: activeTP.split('/')[0] || `${currentYear}`,
      raport: [],
    };

    addStudent(newStudentData);
    logActivity('MUTASI', `Penerimaan Siswa Mutasi Masuk: ${mutasiMasukForm.namaLengkap} diterima di ${mutasiMasukForm.diterimaDiKelas} asal ${mutasiMasukForm.sekolahAsal}`);
    
    setMutasiMasukSuccess(true);
    setMutasiMasukForm({
      namaLengkap: '',
      jenisKelamin: 'L',
      nisn: '',
      noInduk: '',
      nik: '',
      tempatLahir: schoolProfile.desaKelurahan || 'Sungai Buluh',
      tanggalLahir: '2016-01-01',
      agama: 'Islam',
      sekolahAsal: '',
      diterimaDiKelas: 'Kelas 2',
      tanggalMasuk: new Date().toISOString().split('T')[0],
      noSuratPindah: '',
      alasanPindah: 'Pindah Domisili Orang Tua',
      namaAyah: '',
      noHpOrtu: '',
      alamat: `Dusun Suka Maju, Desa ${schoolProfile.desaKelurahan || 'Sungai Buluh'}`,
    });
    setTimeout(() => setMutasiMasukSuccess(false), 4000);
  };

  // ==========================================
  // TAB 4: MUTASI KELUAR (Outgoing Transfer)
  // ==========================================
  const [selectedStudentForMutasiKeluarId, setSelectedStudentForMutasiKeluarId] = useState<string>('');
  const [mutasiKeluarData, setMutasiKeluarData] = useState<MutationRecord>({
    tglMeninggalkan: new Date().toISOString().split('T')[0],
    dariKelas: 'Kelas 1',
    sekolahTujuan: '',
    alasanPindah: 'Mengikuti Orang Tua Pindah Tugas / Domisili',
    noSuratPindah: `421.2/SDN-006/SKP/${new Date().getFullYear()}/001`,
    dikeluarkanTanggal: new Date().toISOString().split('T')[0],
    keterangan: 'Pindah atas permohonan orang tua',
  });
  const [mutasiKeluarSuccess, setMutasiKeluarSuccess] = useState(false);

  const selectedStudentForMutasiKeluar = useMemo(() => {
    return activeStudents.find(s => s.id === selectedStudentForMutasiKeluarId) || null;
  }, [activeStudents, selectedStudentForMutasiKeluarId]);

  // Sync dariKelas with selected student
  React.useEffect(() => {
    if (selectedStudentForMutasiKeluar) {
      setMutasiKeluarData(prev => ({
        ...prev,
        dariKelas: selectedStudentForMutasiKeluar.kelasSekarang || 'Kelas 1',
      }));
    }
  }, [selectedStudentForMutasiKeluar]);

  const handleProcessMutasiKeluar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudentForMutasiKeluar) {
      alert('Pilih siswa yang akan diproses mutasi keluar.');
      return;
    }
    if (!mutasiKeluarData.sekolahTujuan?.trim()) {
      alert('Sekolah tujuan mutasi keluar wajib diisi.');
      return;
    }

    processMutation(selectedStudentForMutasiKeluar.id, {
      ...mutasiKeluarData,
      tahunAjaran: activeTP,
    });
    logActivity('MUTASI', `Memproses Mutasi Keluar siswa ${selectedStudentForMutasiKeluar.namaLengkap} ke ${mutasiKeluarData.sekolahTujuan} (TP ${activeTP})`);
    setMutasiKeluarSuccess(true);
    setSelectedStudentForMutasiKeluarId('');
    setTimeout(() => setMutasiKeluarSuccess(false), 4000);
  };

  // Semua riwayat siswa mutasi keluar (seluruh tahun)
  const allMutasiKeluarStudents = useMemo(() => {
    return students.filter(s => s.status === 'Mutasi Keluar' || Boolean(s.mutasi));
  }, [students]);

  // Siswa mutasi keluar khusus pada Tahun Ajar Aktif (selain tahun aktif disembunyikan)
  const studentsMutasiKeluar = useMemo(() => {
    if (!filterMutasiOnlyActiveYear) return allMutasiKeluarStudents;
    return allMutasiKeluarStudents.filter(s => {
      return (
        isInAcademicYear(s.mutasi?.tglMeninggalkan, activeTP) ||
        isInAcademicYear(s.mutasi?.dikeluarkanTanggal, activeTP) ||
        isInAcademicYear(s.mutasi?.tahunAjaran, activeTP) ||
        (s.status === 'Mutasi Keluar' && !s.mutasi?.tglMeninggalkan && isInAcademicYear(s.updatedAt, activeTP))
      );
    });
  }, [allMutasiKeluarStudents, activeTP, filterMutasiOnlyActiveYear]);

  // Jumlah siswa mutasi keluar tahun lain yang disembunyikan
  const hiddenMutasiKeluarCount = allMutasiKeluarStudents.length - studentsMutasiKeluar.length;

  // ==========================================
  // TAB 5: TABEL JUMLAH SISWA PER ROMBEL
  // ==========================================
  const rombelStats = useMemo(() => {
    return availableClasses.map((kelas, idx) => {
      const classStudents = activeStudents.filter(s => s.kelasSekarang === kelas);
      const jmlL = classStudents.filter(s => s.jenisKelamin === 'L').length;
      const jmlP = classStudents.filter(s => s.jenisKelamin === 'P').length;
      const total = classStudents.length;
      const persentase = totalActive > 0 ? ((total / totalActive) * 100).toFixed(1) : '0';
      const tingkat = getTingkatKelasNumber(kelas);

      return {
        no: idx + 1,
        kelas,
        tingkat,
        waliKelas: idx === 0 ? 'Siti Rahmawati, S.Pd.' :
                   idx === 1 ? 'Ahmad Fauzi, S.Pd.SD' :
                   idx === 2 ? 'Nurul Hidayati, S.Pd.' :
                   idx === 3 ? 'Budi Santoso, S.Pd.' :
                   idx === 4 ? 'Dewi Anggraini, S.Pd.' :
                   idx === 5 ? 'Hendri Saputra, S.Pd.' : `Wali Kelas ${kelas}`,
        nipWaliKelas: `1985011${idx % 10} 201001 1 00${(idx % 9) + 1}`,
        jmlL,
        jmlP,
        total,
        persentase,
      };
    });
  }, [availableClasses, activeStudents, totalActive]);

  // Rekapitulasi per Tingkat Kelas (Tingkat 1 sampai dengan Tingkat 6)
  const tingkatStats = useMemo(() => {
    return [1, 2, 3, 4, 5, 6].map((tingkat) => {
      const classStudents = activeStudents.filter(s => getTingkatKelasNumber(s.kelasSekarang) === tingkat);
      const rombels = availableClasses.filter(c => getTingkatKelasNumber(c) === tingkat);
      const jmlL = classStudents.filter(s => s.jenisKelamin === 'L').length;
      const jmlP = classStudents.filter(s => s.jenisKelamin === 'P').length;
      const total = classStudents.length;
      const persentase = totalActive > 0 ? ((total / totalActive) * 100).toFixed(1) : '0';

      return {
        tingkat,
        label: `Kelas ${tingkat} (Tingkat ${tingkat})`,
        rombels,
        rombelCount: Math.max(1, rombels.length),
        jmlL,
        jmlP,
        total,
        persentase,
      };
    });
  }, [activeStudents, availableClasses, totalActive]);

  // Print function
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner Ribbon */}
      <div className="bg-gradient-to-r from-[#003399] via-blue-800 to-indigo-900 rounded-2xl p-5 md:p-6 text-white shadow-xl relative overflow-hidden print:hidden">
        <div className="absolute right-0 top-0 translate-x-10 -translate-y-10 w-64 h-64 bg-white/10 rounded-full blur-2xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-3 py-1 rounded-full text-xs font-black bg-amber-400 text-slate-950 uppercase tracking-wider flex items-center gap-1.5 shadow-sm">
                <Calendar className="w-3.5 h-3.5" />
                <span>TAHUN AJARAN AKTIF: {activeTP}</span>
              </span>
              <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-white/20 text-blue-100 backdrop-blur-xs">
                Semester {activeSemester}
              </span>
              <span className="px-2.5 py-1 rounded-full text-xs font-extrabold bg-emerald-500/80 text-white backdrop-blur-xs flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Kelas 1 s/d Kelas 6 (Aktif)</span>
              </span>
              <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-500/80 text-white backdrop-blur-xs">
                Rombel Variabel ({availableClasses.length} Rombel)
              </span>
            </div>

            <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white flex items-center gap-2.5">
              <UserCheck className="w-8 h-8 text-amber-300" />
              <span>Data Siswa Aktif (Kelas 1 - 6)</span>
            </h1>

            <p className="text-xs sm:text-sm text-blue-100 max-w-2xl leading-relaxed">
              Daftar resmi peserta didik aktif SDN 006 SUNGAI BULUH khusus untuk <strong className="text-amber-300 font-bold">Kelas 1 sampai dengan Kelas 6</strong> pada Tahun Pelajaran <strong className="text-amber-300 font-bold">{activeTP}</strong>. Rombongan belajar (rombel) bersifat fleksibel/variabel, dilengkapi menu edit riwayat masuk, mutasi masuk/keluar, tabel rekapitulasi rombel, dan analisis gender (L/P).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {/* Template Rombel Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsTemplateDropdownOpen((prev) => !prev)}
                className="flex items-center gap-1.5 px-3 py-2 bg-white/15 hover:bg-white/25 border border-white/25 rounded-xl text-xs font-bold text-white transition-all shadow-sm cursor-pointer"
                title="Unduh Template Excel untuk merubah rombel / kelas siswa aktif"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-300" />
                <span>Template Rombel</span>
              </button>

              {isTemplateDropdownOpen && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-2 z-30 animate-fade-in text-slate-800 dark:text-slate-200">
                  <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800">
                    <p className="text-xs font-black text-[#003399] dark:text-blue-400">
                      Format Template Excel (.XLSX)
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      Khusus untuk merubah rombel siswa aktif Kelas 1 s/d 6
                    </p>
                  </div>

                  <div className="p-1 space-y-1">
                    <button
                      type="button"
                      onClick={handleDownloadPopulatedTemplate}
                      className="w-full text-left p-2.5 rounded-xl hover:bg-blue-50 dark:hover:bg-slate-800 transition-colors flex items-start gap-2.5 cursor-pointer group"
                    >
                      <Download className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0 group-hover:scale-110 transition-transform" />
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-bold text-slate-900 dark:text-white">
                            Terisi Siswa Aktif ({activeStudents.length} Siswa)
                          </p>
                          <span className="text-[9px] font-extrabold px-1.5 py-0.2 bg-emerald-500 text-white rounded">
                            Disarankan
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-tight">
                          NIS, NISN, & Nama otomatis terisi. Cukup isi kolom <strong>Rombel Baru</strong>.
                        </p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={handleDownloadBlankTemplate}
                      className="w-full text-left p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-start gap-2.5 cursor-pointer group"
                    >
                      <FileSpreadsheet className="w-4 h-4 text-slate-500 mt-0.5 shrink-0 group-hover:scale-110 transition-transform" />
                      <div>
                        <p className="text-xs font-bold text-slate-900 dark:text-white">
                          Template Kosong (Contoh)
                        </p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-tight">
                          Template format kosong dengan contoh pengisian & lembar petunjuk.
                        </p>
                      </div>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Impor Rombel Excel Button */}
            {currentRole !== 'umum' && (
              <button
                type="button"
                onClick={() => setIsImportRombelModalOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-400 hover:bg-emerald-300 text-slate-950 rounded-xl text-xs font-black transition-all shadow-md cursor-pointer hover:shadow-lg active:scale-98"
                title="Impor berkas Excel (.xlsx) untuk merubah rombel siswa secara massal"
              >
                <Upload className="w-4 h-4 text-slate-950" />
                <span>Impor Rombel Excel</span>
              </button>
            )}

            {/* Kelola Pilihan Rombel */}
            {currentRole !== 'umum' && (
              <button
                type="button"
                onClick={() => setIsManageClassesOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 bg-white/15 hover:bg-white/25 border border-white/25 rounded-xl text-xs font-bold text-white transition-all shadow-sm cursor-pointer"
                title="Kelola & edit daftar pilihan kelas/rombel sekolah"
              >
                <Layers className="w-4 h-4 text-amber-300" />
                <span>Kelola Rombel</span>
              </button>
            )}

            <button
              onClick={() => exportStudentsCSV(activeStudents)}
              className="flex items-center gap-1.5 px-3 py-2 bg-white/15 hover:bg-white/25 border border-white/25 rounded-xl text-xs font-bold text-white transition-all shadow-sm cursor-pointer"
              title="Unduh Data Siswa Aktif format CSV / Excel"
            >
              <Download className="w-4 h-4 text-amber-300" />
              <span>Ekspor Excel</span>
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-xl text-xs font-extrabold transition-all shadow-md cursor-pointer"
              title="Cetak Halaman ini"
            >
              <Printer className="w-4 h-4" />
              <span>Cetak Laporan</span>
            </button>
          </div>
        </div>

        {/* Quick Stat Pill Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-white/15">
          <div className="bg-white/10 backdrop-blur-xs rounded-xl p-3 border border-white/15">
            <p className="text-[11px] font-bold text-blue-200">Total Siswa Aktif</p>
            <p className="text-2xl font-black text-white mt-0.5">{totalActive} <span className="text-xs font-normal text-blue-200">Siswa</span></p>
          </div>
          <div className="bg-white/10 backdrop-blur-xs rounded-xl p-3 border border-white/15">
            <p className="text-[11px] font-bold text-blue-200">Siswa Laki-laki (L)</p>
            <p className="text-2xl font-black text-cyan-300 mt-0.5">{totalLaki} <span className="text-xs font-normal text-blue-200">({persenLaki}%)</span></p>
          </div>
          <div className="bg-white/10 backdrop-blur-xs rounded-xl p-3 border border-white/15">
            <p className="text-[11px] font-bold text-blue-200">Siswa Perempuan (P)</p>
            <p className="text-2xl font-black text-pink-300 mt-0.5">{totalPerempuan} <span className="text-xs font-normal text-blue-200">({persenPerempuan}%)</span></p>
          </div>
          <div className="bg-white/10 backdrop-blur-xs rounded-xl p-3 border border-white/15">
            <p className="text-[11px] font-bold text-blue-200">Jumlah Rombel</p>
            <p className="text-2xl font-black text-amber-300 mt-0.5">{availableClasses.length} <span className="text-xs font-normal text-blue-200">Kelas</span></p>
          </div>
        </div>
      </div>

      {/* NAVIGASI TAB MENU UTAMA */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden print:hidden">
        <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 overflow-x-auto scrollbar-thin">
          {[
            { id: 'daftar', label: 'Daftar Siswa Aktif', icon: Users, badge: totalActive },
            { id: 'edit', label: 'Edit Data Siswa', icon: Edit3 },
            { id: 'mutasi-masuk', label: 'Mutasi Masuk', icon: UserPlus, badge: studentsMutasiMasuk.length },
            { id: 'mutasi-keluar', label: 'Mutasi Keluar', icon: UserMinus, badge: studentsMutasiKeluar.length },
            { id: 'tabel-rombel', label: 'Tabel Siswa per Rombel', icon: Table },
            { id: 'gender', label: 'L / P (Rasio Gender)', icon: BarChart2 },
          ].map((item) => {
            const Icon = item.icon;
            const isActive = subTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setSubTab(item.id as ActiveStudentsSubTab)}
                className={cn(
                  "flex items-center gap-2 px-4 py-3.5 text-xs font-bold border-b-2 whitespace-nowrap transition-all cursor-pointer",
                  isActive
                    ? "border-[#003399] text-[#003399] dark:text-blue-400 bg-white dark:bg-slate-900 shadow-xs"
                    : "border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100/70 dark:hover:bg-slate-800/40"
                )}
              >
                <Icon className={cn("w-4 h-4", isActive ? "text-[#003399] dark:text-blue-400" : "text-slate-400")} />
                <span>{item.label}</span>
                {item.badge !== undefined && (
                  <span className={cn(
                    "px-1.5 py-0.5 rounded-full text-[10px] font-extrabold",
                    isActive ? "bg-blue-100 text-[#003399] dark:bg-blue-950 dark:text-blue-300" : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-400"
                  )}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: DAFTAR SISWA AKTIF */}
      {/* ========================================================================= */}
      {subTab === 'daftar' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 print:hidden">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Cari nama siswa aktif, NISN, NIS, atau NIK..."
                className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-slate-600"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Filter Rombel */}
              <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-800 px-2.5 py-1 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
                <span className="text-slate-500 font-medium">Rombel:</span>
                <select
                  value={selectedClass}
                  onChange={(e) => {
                    setSelectedClass(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="bg-transparent font-bold text-slate-800 dark:text-slate-200 focus:outline-hidden cursor-pointer"
                >
                  <option value="ALL">Semua Rombel (Kelas 1 - 6) • {totalActive}</option>
                  <optgroup label="Filter per Tingkat Kelas (1 s/d 6)">
                    {[1, 2, 3, 4, 5, 6].map(t => {
                      const count = activeStudents.filter(s => getTingkatKelasNumber(s.kelasSekarang) === t).length;
                      return (
                        <option key={`opt-t-${t}`} value={`TINGKAT_${t}`}>
                          Tingkat {t} (Semua Rombel Kelas {t}) - {count} Siswa
                        </option>
                      );
                    })}
                  </optgroup>
                  <optgroup label="Filter per Rombel Variabel Spesifik">
                    {availableClasses.map(cls => (
                      <option key={cls} value={cls}>
                        {cls} ({activeStudents.filter(s => s.kelasSekarang === cls).length} Siswa)
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>

              {/* Filter Gender */}
              <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
                {(['ALL', 'L', 'P'] as const).map(g => (
                  <button
                    key={g}
                    onClick={() => {
                      setSelectedGender(g);
                      setCurrentPage(1);
                    }}
                    className={cn(
                      "px-2.5 py-1 rounded-lg font-bold transition-colors cursor-pointer",
                      selectedGender === g
                        ? "bg-[#003399] text-white shadow-xs"
                        : "text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-700"
                    )}
                  >
                    {g === 'ALL' ? 'Semua' : g === 'L' ? 'L (Laki-laki)' : 'P (Perempuan)'}
                  </button>
                ))}
              </div>

              {/* Sort Control & Order Button (Sesuai Tombol yang Dipilih) */}
              <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
                <select
                  value={sortBy}
                  onChange={(e) => {
                    setSortBy(e.target.value as any);
                    setCurrentPage(1);
                  }}
                  className="bg-transparent font-bold text-slate-800 dark:text-slate-200 focus:outline-hidden cursor-pointer px-1.5 py-1 text-xs"
                  title="Pilih kolom pengurutan siswa aktif"
                >
                  <option value="nis">Urut: NIS</option>
                  <option value="nama">Urut: Nama</option>
                  <option value="kelas">Urut: Kelas</option>
                  <option value="tanggal">Urut: Tgl Diterima</option>
                </select>
                <button
                  type="button"
                  onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                  className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
                  title={sortOrder === 'asc' ? 'Urutan Menaik (A-Z / 1-9)' : 'Urutan Menurun (Z-A / 9-1)'}
                >
                  <ArrowUpDown className="w-3.5 h-3.5 text-[#003399] dark:text-blue-400" />
                </button>
              </div>

              {/* Impor Rombel Excel Shortcut */}
              {currentRole !== 'umum' && (
                <button
                  type="button"
                  onClick={() => setIsImportRombelModalOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer ml-auto"
                  title="Impor berkas Excel (.xlsx) untuk merubah rombel siswa secara massal"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Impor Rombel Excel</span>
                </button>
              )}

              {/* Tambah Siswa */}
              {currentRole !== 'umum' && (
                <button
                  onClick={onOpenAddModal}
                  className="flex items-center gap-1.5 px-3 py-2 bg-[#003399] hover:bg-[#002266] text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>+ Tambah Siswa</span>
                </button>
              )}
            </div>

            {/* Quick Grade Filter Chips Bar */}
            <div className="w-full pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1 mr-1">
                <Filter className="w-3.5 h-3.5 text-blue-600" />
                <span>Pintasan Tingkat:</span>
              </span>
              <button
                type="button"
                onClick={() => { setSelectedClass('ALL'); setCurrentPage(1); }}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-[11px] font-extrabold transition-all cursor-pointer",
                  selectedClass === 'ALL'
                    ? "bg-[#003399] text-white shadow-xs scale-105"
                    : "bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300"
                )}
              >
                Semua Kelas (1-6) • {totalActive}
              </button>
              {[1, 2, 3, 4, 5, 6].map(t => {
                const isSelected = selectedClass === `TINGKAT_${t}`;
                const count = activeStudents.filter(s => getTingkatKelasNumber(s.kelasSekarang) === t).length;
                return (
                  <button
                    key={`chip-t-${t}`}
                    type="button"
                    onClick={() => { setSelectedClass(`TINGKAT_${t}`); setCurrentPage(1); }}
                    className={cn(
                      "px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1",
                      isSelected
                        ? "bg-blue-600 text-white shadow-xs scale-105"
                        : "bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300"
                    )}
                  >
                    <span>Tingkat {t}</span>
                    <span className={cn(
                      "px-1 py-0.2 rounded text-[9.5px] font-mono",
                      isSelected ? "bg-white/20 text-white" : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400"
                    )}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Table of Active Students */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-800/40">
              <span className="text-xs font-extrabold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
                <Users className="w-4 h-4 text-[#003399] dark:text-blue-400" />
                <span>Daftar Siswa Terdaftar: {filteredActiveStudents.length} Peserta Didik</span>
              </span>
              <span className="text-xs text-slate-500 font-mono">
                Halaman {currentPage} dari {totalPages}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700 uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-3 text-center w-12">No</th>
                    <th 
                      onClick={() => {
                        if (sortBy === 'nama') {
                          setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                        } else {
                          setSortBy('nama');
                          setSortOrder('asc');
                        }
                      }}
                      className="py-3 px-3 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700/80 transition-colors select-none"
                      title="Klik untuk mengurutkan berdasarkan nama siswa"
                    >
                      <div className="flex items-center gap-1">
                        <span>Siswa</span>
                        <ArrowUpDown className={cn("w-3 h-3", sortBy === 'nama' ? "text-blue-600 dark:text-blue-400" : "text-slate-400 opacity-60")} />
                      </div>
                    </th>
                    <th 
                      onClick={() => {
                        if (sortBy === 'nis') {
                          setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                        } else {
                          setSortBy('nis');
                          setSortOrder('asc');
                        }
                      }}
                      className="py-3 px-3 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700/80 transition-colors select-none"
                      title="Klik untuk mengurutkan berdasarkan NIS"
                    >
                      <div className="flex items-center gap-1">
                        <span>NIS / NISN</span>
                        <ArrowUpDown className={cn("w-3 h-3", sortBy === 'nis' ? "text-blue-600 dark:text-blue-400" : "text-slate-400 opacity-60")} />
                      </div>
                    </th>
                    <th className="py-3 px-3 text-center">L/P</th>
                    <th 
                      onClick={() => {
                        if (sortBy === 'kelas') {
                          setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                        } else {
                          setSortBy('kelas');
                          setSortOrder('asc');
                        }
                      }}
                      className="py-3 px-3 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700/80 transition-colors select-none"
                      title="Klik untuk mengurutkan berdasarkan rombel"
                    >
                      <div className="flex items-center gap-1">
                        <span>Rombel Sekarang</span>
                        <ArrowUpDown className={cn("w-3 h-3", sortBy === 'kelas' ? "text-blue-600 dark:text-blue-400" : "text-slate-400 opacity-60")} />
                      </div>
                    </th>
                    <th 
                      onClick={() => {
                        if (sortBy === 'tanggal') {
                          setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                        } else {
                          setSortBy('tanggal');
                          setSortOrder('asc');
                        }
                      }}
                      className="py-3 px-3 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700/80 transition-colors select-none"
                      title="Klik untuk mengurutkan berdasarkan tanggal diterima"
                    >
                      <div className="flex items-center gap-1">
                        <span>Diterima di Kelas</span>
                        <ArrowUpDown className={cn("w-3 h-3", sortBy === 'tanggal' ? "text-blue-600 dark:text-blue-400" : "text-slate-400 opacity-60")} />
                      </div>
                    </th>
                    <th className="py-3 px-3">Pendidikan Asal</th>
                    <th className="py-3 px-3 text-center print:hidden">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {paginatedStudents.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-12 text-slate-500">
                        <UserCheck className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                        <p className="font-bold text-sm">Tidak ada siswa aktif ditemukan.</p>
                        <p className="text-xs text-slate-400 mt-1">Coba sesuaikan kata kunci pencarian atau filter rombel/gender.</p>
                      </td>
                    </tr>
                  ) : (
                    paginatedStudents.map((s, index) => {
                      const rowNum = (currentPage - 1) * itemsPerPage + index + 1;
                      return (
                        <tr 
                          key={s.id} 
                          className="hover:bg-blue-50/50 dark:hover:bg-slate-800/50 transition-colors group"
                        >
                          <td className="py-3 px-3 text-center font-mono text-slate-500 font-bold">
                            {rowNum}
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-3">
                              <div 
                                onClick={() => onSelectDetail(s.id)}
                                className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-950/80 text-[#003399] dark:text-blue-300 font-bold flex items-center justify-center shrink-0 overflow-hidden border border-blue-200 dark:border-blue-900 cursor-pointer shadow-2xs"
                                title="Lihat profil detail"
                              >
                                {s.fotoUrl ? (
                                  <img src={s.fotoUrl} alt={s.namaLengkap} className="w-full h-full object-cover" />
                                ) : (
                                  s.namaLengkap.charAt(0)
                                )}
                              </div>
                              <div>
                                <button
                                  type="button"
                                  onClick={() => onSelectDetail(s.id)}
                                  className="font-bold text-slate-900 dark:text-slate-100 hover:text-[#003399] dark:hover:text-blue-400 text-left cursor-pointer transition-colors"
                                >
                                  {s.namaLengkap}
                                </button>
                                <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                                  <span>{s.tempatLahir}, {formatIndonesianDate(s.tanggalLahir)}</span>
                                  <span>•</span>
                                  <span>{s.agama}</span>
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <div className="font-mono text-slate-800 dark:text-slate-200 font-semibold">{s.noInduk}</div>
                            <div className="font-mono text-[11px] text-slate-500">NISN: {s.nisn}</div>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <span className={cn(
                              "px-2 py-0.5 rounded-md text-[10px] font-black",
                              s.jenisKelamin === 'L' 
                                ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border border-blue-200 dark:border-blue-900" 
                                : "bg-pink-100 text-pink-800 dark:bg-pink-950 dark:text-pink-300 border border-pink-200 dark:border-pink-900"
                            )}>
                              {s.jenisKelamin === 'L' ? 'L' : 'P'}
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            <span className="font-bold text-blue-800 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 px-2 py-1 rounded-lg border border-blue-200/60 dark:border-blue-900/60">
                              {s.kelasSekarang}
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            <span className="font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                              {(!s.diterimaDiKelas || s.diterimaDiKelas === '7' || s.diterimaDiKelas === '7A' || s.diterimaDiKelas === '7B' || s.diterimaDiKelas.toLowerCase() === 'kelas 7') ? 'Kelas 1' : s.diterimaDiKelas}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-slate-600 dark:text-slate-400 max-w-[180px] truncate" title={s.sekolahAsalTK || '-'}>
                            {s.sekolahAsalTK || '-'}
                          </td>
                          <td className="py-3 px-3 text-center print:hidden">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => onSelectDetail(s.id)}
                                className="p-1.5 text-blue-600 hover:text-white hover:bg-[#003399] rounded-lg transition-colors cursor-pointer"
                                title="Buka Profil Lengkap Siswa"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                              {currentRole !== 'umum' && (
                                <button
                                  type="button"
                                  onClick={() => onEditStudent(s, 'masuk')}
                                  className="p-1.5 text-amber-600 hover:text-white hover:bg-amber-600 rounded-lg transition-colors cursor-pointer"
                                  title="Edit Siswa & Riwayat Masuk"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => onPrintBukuInduk(s.id)}
                                className="p-1.5 text-slate-600 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
                                title="Cetak Lembar Buku Induk"
                              >
                                <BookOpen className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => onPrintKartuPelajar(s.id)}
                                className="p-1.5 text-emerald-600 hover:text-white hover:bg-emerald-600 rounded-lg transition-colors cursor-pointer"
                                title="Cetak Kartu Pelajar"
                              >
                                <CreditCard className="w-3.5 h-3.5" />
                              </button>
                              {currentRole !== 'umum' && (
                                <button
                                  type="button"
                                  onClick={() => onMutasi(s)}
                                  className="p-1.5 text-rose-600 hover:text-white hover:bg-rose-600 rounded-lg transition-colors cursor-pointer"
                                  title="Proses Mutasi Keluar"
                                >
                                  <UserMinus className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/30 print:hidden">
                <button
                  type="button"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-300 dark:border-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Sebelumnya</span>
                </button>

                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }).map((_, i) => {
                    const pageNum = i + 1;
                    if (pageNum === 1 || pageNum === totalPages || (pageNum >= currentPage - 1 && pageNum <= currentPage + 1)) {
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
                          className={cn(
                            "w-7 h-7 text-xs font-bold rounded-lg transition-colors cursor-pointer",
                            currentPage === pageNum
                              ? "bg-[#003399] text-white"
                              : "hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300"
                          )}
                        >
                          {pageNum}
                        </button>
                      );
                    }
                    if (pageNum === currentPage - 2 || pageNum === currentPage + 2) {
                      return <span key={pageNum} className="text-slate-400">...</span>;
                    }
                    return null;
                  })}
                </div>

                <button
                  type="button"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-300 dark:border-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <span>Selanjutnya</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: EDIT DATA SISWA & RIWAYAT MASUK */}
      {/* ========================================================================= */}
      {subTab === 'edit' && (
        <div className="space-y-4">
          {/* Header & Student Picker */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Edit3 className="w-5 h-5 text-amber-500" />
                  <span>Edit Data Siswa & Riwayat Masuk</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Sesuaikan informasi siswa aktif, terutama bagian diterima di kelas dan riwayat pendidikan asal.
                </p>
              </div>

              {/* Quick Bulk Update Banner */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/40 dark:to-teal-950/20 border border-emerald-200 dark:border-emerald-800/60 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <ArrowRightLeft className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-emerald-950 dark:text-emerald-100 flex items-center gap-1.5">
                      <span>Perubahan Rombel Massal via Excel</span>
                      <span className="text-[9px] font-black uppercase px-1.5 py-0.2 bg-emerald-600 text-white rounded">
                        Cepat
                      </span>
                    </h4>
                    <p className="text-[11px] text-emerald-800 dark:text-emerald-300 mt-0.5">
                      Ingin mengubah atau memindahkan rombel/kelas untuk banyak siswa sekaligus? Gunakan fitur impor Excel.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleDownloadPopulatedTemplate}
                    className="px-3 py-1.5 bg-white dark:bg-slate-900 hover:bg-slate-50 border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
                    title="Unduh template Excel terisi data siswa aktif saat ini"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Unduh Template Rombel</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsImportRombelModalOpen(true)}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-black transition-all shadow-sm cursor-pointer flex items-center gap-1.5"
                    title="Buka jendela unggah dan impor perubahan rombel Excel"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Impor Rombel Excel</span>
                  </button>
                </div>
              </div>

              {/* Student Navigation Controls */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrevEditStudent}
                  disabled={!hasPrevEdit}
                  className={cn(
                    "flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-xl border transition-colors cursor-pointer",
                    hasPrevEdit
                      ? "border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200"
                      : "opacity-40 cursor-not-allowed border-slate-200 dark:border-slate-800 text-slate-400"
                  )}
                  title="Pindah ke siswa sebelumnya"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Sebelumnya</span>
                </button>

                <span className="text-xs font-mono font-bold text-[#003399] dark:text-blue-400 bg-blue-50 dark:bg-blue-950 px-2 py-1 rounded-lg">
                  {editIndex + 1} / {activeStudents.length}
                </span>

                <button
                  type="button"
                  onClick={handleNextEditStudent}
                  disabled={!hasNextEdit}
                  className={cn(
                    "flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-xl border transition-colors cursor-pointer",
                    hasNextEdit
                      ? "border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200"
                      : "opacity-40 cursor-not-allowed border-slate-200 dark:border-slate-800 text-slate-400"
                  )}
                  title="Pindah ke siswa selanjutnya"
                >
                  <span>Selanjutnya</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Quick Picker Dropdown */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 shrink-0">
                Pilih Siswa Aktif yang Diedit:
              </label>
              <select
                value={selectedStudentForEditId}
                onChange={(e) => setSelectedStudentForEditId(e.target.value)}
                className="flex-1 px-3 py-2 text-xs font-bold rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:outline-hidden cursor-pointer"
              >
                {activeStudents.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.namaLengkap} • NIS: {s.noInduk} • Kelas: {s.kelasSekarang} (Diterima di: {(!s.diterimaDiKelas || s.diterimaDiKelas === '7' || s.diterimaDiKelas === '7A' || s.diterimaDiKelas === '7B' || s.diterimaDiKelas.toLowerCase() === 'kelas 7') ? 'Kelas 1' : s.diterimaDiKelas})
                  </option>
                ))}
              </select>

              {selectedStudentForEdit && (
                <button
                  type="button"
                  onClick={() => onEditStudent(selectedStudentForEdit, 'masuk')}
                  className="px-3 py-2 bg-[#003399] hover:bg-[#002266] text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer shrink-0 flex items-center justify-center gap-1.5"
                  title="Buka form edit lengkap pop-up"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <span>Buka Form Modal Lengkap</span>
                </button>
              )}
            </div>
          </div>

          {/* Form Content */}
          {selectedStudentForEdit ? (
            <form onSubmit={handleSaveInlineEdit} className="space-y-4">
              {editSaveSuccess && (
                <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 flex items-center gap-2.5 text-xs font-bold animate-in fade-in">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>Perubahan data siswa dan riwayat penerimaan kelas berhasil disimpan secara permanen!</span>
                </div>
              )}

              {/* CARD 1: Riwayat Masuk & Pendidikan Asal (Fokus Utama Request #3) */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border-2 border-indigo-200 dark:border-indigo-900 shadow-sm space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-indigo-100 dark:border-indigo-950">
                  <h4 className="text-sm font-extrabold text-[#003399] dark:text-blue-300 uppercase tracking-wide flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    <span>Riwayat Masuk & Pendidikan Asal (Diterima di Kelas)</span>
                  </h4>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                    Sesuai Standar Buku Induk Kemdikbud
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Diterima di Kelas */}
                  <div className="bg-indigo-50/60 dark:bg-indigo-950/30 p-3.5 rounded-xl border border-indigo-200 dark:border-indigo-800">
                    <label className="block text-xs font-black text-indigo-900 dark:text-indigo-200 mb-1">
                      Diterima di Kelas <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      list="list-kelas-saran"
                      value={(!editFormData.diterimaDiKelas || editFormData.diterimaDiKelas === '7' || editFormData.diterimaDiKelas === '7A' || editFormData.diterimaDiKelas === '7B' || editFormData.diterimaDiKelas.toLowerCase() === 'kelas 7') ? 'Kelas 1' : editFormData.diterimaDiKelas}
                      onChange={(e) => setEditFormData({ ...editFormData, diterimaDiKelas: e.target.value })}
                      placeholder="Contoh: Kelas 1, Kelas 2 (Pindahan)..."
                      className="w-full px-3 py-2 text-xs font-bold rounded-lg border-2 border-indigo-400 dark:border-indigo-600 bg-white dark:bg-slate-800 text-indigo-900 dark:text-indigo-200 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                      required
                    />
                    <datalist id="list-kelas-saran">
                      {availableClasses.map(c => (
                        <option key={c} value={c} />
                      ))}
                      <option value="Kelas 1 (Siswa Baru)" />
                      <option value="Kelas 2 (Pindahan)" />
                      <option value="Kelas 3 (Pindahan)" />
                      <option value="Kelas 4 (Pindahan)" />
                      <option value="Kelas 5 (Pindahan)" />
                      <option value="Kelas 6 (Pindahan)" />
                    </datalist>

                    <div className="flex flex-wrap items-center gap-1 mt-2">
                      <span className="text-[10px] text-slate-500 font-bold">Pintasan:</span>
                      <button
                        type="button"
                        onClick={() => setEditFormData({ ...editFormData, diterimaDiKelas: editFormData.kelasSekarang || 'Kelas 1' })}
                        className="text-[10px] px-1.5 py-0.5 bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 rounded font-semibold cursor-pointer hover:bg-blue-200"
                        title="Samakan dengan kelas sekarang"
                      >
                        = Kelas Sekarang
                      </button>
                      {['Kelas 1', 'Kelas 2', 'Kelas 3', 'Kelas 4', 'Kelas 5', 'Kelas 6'].map(k => (
                        <button
                          key={k}
                          type="button"
                          onClick={() => setEditFormData({ ...editFormData, diterimaDiKelas: k })}
                          className="text-[10px] px-1.5 py-0.5 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded font-semibold cursor-pointer hover:bg-slate-300"
                        >
                          {k}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Tanggal Diterima */}
                  <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40">
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Diterima Tanggal
                    </label>
                    <input
                      type="date"
                      value={editFormData.tanggalDiterima || ''}
                      onChange={(e) => setEditFormData({ ...editFormData, tanggalDiterima: e.target.value })}
                      className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                    />
                    <span className="text-[10px] text-slate-400 mt-1 block">
                      Tanggal pendaftaran / resmi masuk
                    </span>
                  </div>

                  {/* Tahun Masuk */}
                  <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40">
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Tahun Masuk
                    </label>
                    <input
                      type="text"
                      value={editFormData.tahunMasuk || ''}
                      onChange={(e) => setEditFormData({ ...editFormData, tahunMasuk: e.target.value })}
                      placeholder="Contoh: 2024 atau 2025"
                      className="w-full px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                    />
                    <span className="text-[10px] text-slate-400 mt-1 block">
                      Tahun kalender pertama kali terdaftar
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  {/* Sekolah Asal */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Pendidikan Asal (TK / PAUD / RA / SD Pindahan)
                    </label>
                    <input
                      type="text"
                      value={editFormData.sekolahAsalTK || ''}
                      onChange={(e) => setEditFormData({ ...editFormData, sekolahAsalTK: e.target.value })}
                      placeholder="Contoh: TK Pertiwi Sungai Buluh / SD Negeri 001..."
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                    />
                  </div>

                  {/* No Ijazah TK / SKTB */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Nomor Ijazah / SKTB TK / Asal
                    </label>
                    <input
                      type="text"
                      value={editFormData.noIjazahTK || ''}
                      onChange={(e) => setEditFormData({ ...editFormData, noIjazahTK: e.target.value })}
                      placeholder="Contoh: TK-1409-2024-..."
                      className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                    />
                  </div>
                </div>
              </div>

              {/* CARD 2: Identitas & Kelas Sekarang */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                <h4 className="text-sm font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wide flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
                  <GraduationCap className="w-4 h-4 text-blue-600" />
                  <span>Identitas Pokok Siswa & Kelas Sekarang</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Nama Lengkap Siswa <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={editFormData.namaLengkap || ''}
                      onChange={(e) => setEditFormData({ ...editFormData, namaLengkap: e.target.value })}
                      className="w-full px-3 py-2 text-xs font-bold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                      required
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                        Kelas Sekarang <span className="text-rose-500">*</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => setIsManageClassesOpen(true)}
                        className="text-[10.5px] text-blue-600 dark:text-blue-400 hover:underline font-bold flex items-center gap-1 cursor-pointer"
                        title="Kelola & edit daftar pilihan kelas/rombel"
                      >
                        ⚙️ Kelola Pilihan Kelas
                      </button>
                    </div>
                    <select
                      value={editFormData.kelasSekarang || 'Kelas 1'}
                      onChange={(e) => setEditFormData({ ...editFormData, kelasSekarang: e.target.value })}
                      className="w-full px-3 py-2 text-xs font-bold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-blue-800 dark:text-blue-300 focus:ring-2 focus:ring-blue-500 focus:outline-hidden cursor-pointer"
                    >
                      {availableClasses.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Jenis Kelamin <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={editFormData.jenisKelamin || 'L'}
                      onChange={(e) => setEditFormData({ ...editFormData, jenisKelamin: e.target.value as Gender })}
                      className="w-full px-3 py-2 text-xs font-bold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 cursor-pointer"
                    >
                      <option value="L">Laki-laki (L)</option>
                      <option value="P">Perempuan (P)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Nomor Induk (NIS)
                    </label>
                    <input
                      type="text"
                      value={editFormData.noInduk || ''}
                      onChange={(e) => setEditFormData({ ...editFormData, noInduk: e.target.value })}
                      className="w-full px-3 py-2 text-xs font-mono font-bold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      NISN
                    </label>
                    <input
                      type="text"
                      value={editFormData.nisn || ''}
                      onChange={(e) => setEditFormData({ ...editFormData, nisn: e.target.value })}
                      className="w-full px-3 py-2 text-xs font-mono font-bold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Tempat Lahir
                    </label>
                    <input
                      type="text"
                      value={editFormData.tempatLahir || ''}
                      onChange={(e) => setEditFormData({ ...editFormData, tempatLahir: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Tanggal Lahir
                    </label>
                    <input
                      type="date"
                      value={editFormData.tanggalLahir || ''}
                      onChange={(e) => setEditFormData({ ...editFormData, tanggalLahir: e.target.value })}
                      className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                    />
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => onSelectDetail(selectedStudentForEdit.id)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Lihat Profil Detail
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-2 px-5 py-2.5 bg-[#003399] hover:bg-[#002266] text-white text-xs font-extrabold rounded-xl shadow-md transition-all cursor-pointer hover:scale-[1.02] active:scale-95"
                >
                  <Save className="w-4 h-4 text-amber-300" />
                  <span>Simpan Perubahan Siswa</span>
                </button>
              </div>
            </form>
          ) : (
            <div className="text-center py-12 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
              <p className="text-slate-500 font-bold">Tidak ada data siswa aktif yang dipilih.</p>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: MUTASI MASUK (Incoming Transfer) */}
      {/* ========================================================================= */}
      {subTab === 'mutasi-masuk' && (
        <div className="space-y-6">
          {mutasiMasukSuccess && (
            <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 flex items-center gap-2.5 text-xs font-bold animate-in fade-in">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>Siswa mutasi masuk berhasil didaftarkan ke Data Siswa Aktif dan tercatat dalam buku induk register!</span>
            </div>
          )}

          {/* Form Penerimaan Mutasi Masuk */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 md:p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-base font-extrabold text-[#003399] dark:text-blue-300 flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-blue-600" />
                  <span>Penerimaan Siswa Mutasi Masuk (Pindahan)</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Catat siswa baru pindahan dari sekolah/madrasah lain ke Tahun Ajaran Aktif <strong className="text-blue-700 dark:text-blue-300">{activeTP}</strong>.
                </p>
              </div>
              <span className="px-2.5 py-1 text-xs font-extrabold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 rounded-full">
                Siswa Masuk Baru
              </span>
            </div>

            <form onSubmit={handleSubmitMutasiMasuk} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Nama Lengkap Siswa Pindahan <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={mutasiMasukForm.namaLengkap}
                    onChange={(e) => setMutasiMasukForm({ ...mutasiMasukForm, namaLengkap: e.target.value })}
                    placeholder="Contoh: Muhammad Rizki Pratama"
                    className="w-full px-3 py-2 text-xs font-bold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Jenis Kelamin <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={mutasiMasukForm.jenisKelamin}
                    onChange={(e) => setMutasiMasukForm({ ...mutasiMasukForm, jenisKelamin: e.target.value as Gender })}
                    className="w-full px-3 py-2 text-xs font-bold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 cursor-pointer"
                  >
                    <option value="L">Laki-laki (L)</option>
                    <option value="P">Perempuan (P)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Sekolah Asal Pindahan <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={mutasiMasukForm.sekolahAsal}
                    onChange={(e) => setMutasiMasukForm({ ...mutasiMasukForm, sekolahAsal: e.target.value })}
                    placeholder="Contoh: SD Negeri 002 Singingi"
                    className="w-full px-3 py-2 text-xs font-bold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Diterima di Tingkat Kelas <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={mutasiMasukForm.diterimaDiKelas}
                    onChange={(e) => setMutasiMasukForm({ ...mutasiMasukForm, diterimaDiKelas: e.target.value })}
                    className="w-full px-3 py-2 text-xs font-bold rounded-lg border-2 border-blue-500 bg-white dark:bg-slate-800 text-blue-900 dark:text-blue-300 cursor-pointer"
                  >
                    {availableClasses.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Tanggal Resmi Masuk
                  </label>
                  <input
                    type="date"
                    value={mutasiMasukForm.tanggalMasuk}
                    onChange={(e) => setMutasiMasukForm({ ...mutasiMasukForm, tanggalMasuk: e.target.value })}
                    className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    No. Surat Keterangan Pindah Asal
                  </label>
                  <input
                    type="text"
                    value={mutasiMasukForm.noSuratPindah}
                    onChange={(e) => setMutasiMasukForm({ ...mutasiMasukForm, noSuratPindah: e.target.value })}
                    placeholder="Contoh: 421.2/SDN-02/SKP/..."
                    className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Alasan Pindah
                  </label>
                  <input
                    type="text"
                    value={mutasiMasukForm.alasanPindah}
                    onChange={(e) => setMutasiMasukForm({ ...mutasiMasukForm, alasanPindah: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Nama Orang Tua / Ayah & No HP
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <input
                      type="text"
                      value={mutasiMasukForm.namaAyah}
                      onChange={(e) => setMutasiMasukForm({ ...mutasiMasukForm, namaAyah: e.target.value })}
                      placeholder="Nama Ayah"
                      className="w-full px-2 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                    />
                    <input
                      type="text"
                      value={mutasiMasukForm.noHpOrtu}
                      onChange={(e) => setMutasiMasukForm({ ...mutasiMasukForm, noHpOrtu: e.target.value })}
                      placeholder="0812..."
                      className="w-full px-2 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold rounded-xl shadow-md transition-all cursor-pointer"
                >
                  <UserPlus className="w-4 h-4 text-amber-300" />
                  <span>Daftarkan Siswa Mutasi Masuk</span>
                </button>
              </div>
            </form>
          </div>

          {/* Tabel Riwayat Siswa Mutasi Masuk */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h4 className="text-xs font-extrabold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
                <Building2 className="w-4 h-4 text-blue-600" />
                <span>Daftar Siswa Mutasi Masuk ({studentsMutasiMasuk.length} Siswa)</span>
              </h4>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 text-[11px] font-extrabold bg-blue-100 text-[#003399] dark:bg-blue-950 dark:text-blue-300 rounded-full flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Tahun Ajar Aktif: {activeTP}</span>
                </span>
              </div>
            </div>

            {/* Banner Status Filter Tahun Ajar Aktif */}
            <div className="px-5 py-2.5 bg-blue-50/60 dark:bg-blue-950/30 border-b border-blue-100 dark:border-blue-900/50 flex flex-col md:flex-row md:items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                <span className="font-bold text-blue-800 dark:text-blue-300">Kebijakan Tampilan:</span>
                <span>
                  {filterMutasiOnlyActiveYear 
                    ? `Hanya menampilkan mutasi masuk pada Tahun Ajar Aktif (${activeTP}). Selain tahun itu disembunyikan.`
                    : `Menampilkan seluruh riwayat siswa mutasi masuk (Semua Tahun).`}
                </span>
                {hiddenMutasiMasukCount > 0 && filterMutasiOnlyActiveYear && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 text-[10px] font-bold">
                    {hiddenMutasiMasukCount} siswa tahun lain disembunyikan
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setFilterMutasiOnlyActiveYear(!filterMutasiOnlyActiveYear)}
                className="px-2.5 py-1 text-[11px] font-bold rounded-lg border border-blue-300 dark:border-blue-700 bg-white dark:bg-slate-800 text-blue-800 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/50 transition-colors cursor-pointer self-start md:self-auto shrink-0"
              >
                {filterMutasiOnlyActiveYear ? 'Lihat Semua Tahun' : `Hanya Tahun Aktif (${activeTP})`}
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700 uppercase tracking-wider text-[11px]">
                    <th className="py-2.5 px-3 text-center w-10">No</th>
                    <th className="py-2.5 px-3">Nama Siswa</th>
                    <th className="py-2.5 px-3">NIS / NISN</th>
                    <th className="py-2.5 px-3">Tahun Ajar Masuk</th>
                    <th className="py-2.5 px-3">Sekolah Asal Pindahan</th>
                    <th className="py-2.5 px-3">Diterima di Kelas</th>
                    <th className="py-2.5 px-3">Kelas Sekarang</th>
                    <th className="py-2.5 px-3">Tanggal Diterima</th>
                    <th className="py-2.5 px-3 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {studentsMutasiMasuk.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-center py-8 text-slate-500">
                        {filterMutasiOnlyActiveYear 
                          ? `Tidak ada siswa mutasi masuk pada Tahun Ajar Aktif (${activeTP}).` 
                          : 'Belum ada riwayat siswa mutasi masuk yang terdaftar.'}
                        {hiddenMutasiMasukCount > 0 && filterMutasiOnlyActiveYear && (
                          <div className="mt-1 text-xs text-amber-600 dark:text-amber-400 font-medium">
                            ({hiddenMutasiMasukCount} siswa terdaftar di tahun pelajaran lain disembunyikan sesuai filter aktif)
                          </div>
                        )}
                      </td>
                    </tr>
                  ) : (
                    studentsMutasiMasuk.map((s, idx) => {
                      const studentTP = getAcademicYearFromDate(s.tanggalDiterima) || (s.tahunMasuk ? `${s.tahunMasuk}/${parseInt(s.tahunMasuk) + 1}` : activeTP);
                      const isCurrentTP = studentTP === activeTP;
                      return (
                        <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <td className="py-2.5 px-3 text-center font-mono text-slate-500">{idx + 1}</td>
                          <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-slate-100">{s.namaLengkap}</td>
                          <td className="py-2.5 px-3 font-mono text-slate-700 dark:text-slate-300">{s.noInduk} / {s.nisn}</td>
                          <td className="py-2.5 px-3">
                            <span className={cn(
                              "px-2 py-0.5 rounded-md font-mono font-bold text-[10px]",
                              isCurrentTP 
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800" 
                                : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                            )}>
                              TP {studentTP}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-slate-800 dark:text-slate-200">{s.sekolahAsalTK || '-'}</td>
                          <td className="py-2.5 px-3 font-bold text-indigo-700 dark:text-indigo-300">{(!s.diterimaDiKelas || s.diterimaDiKelas === '7' || s.diterimaDiKelas === '7A' || s.diterimaDiKelas === '7B' || s.diterimaDiKelas.toLowerCase() === 'kelas 7') ? 'Kelas 1' : s.diterimaDiKelas}</td>
                          <td className="py-2.5 px-3 font-bold text-blue-700 dark:text-blue-300">{s.kelasSekarang}</td>
                          <td className="py-2.5 px-3 text-slate-500">{formatIndonesianDate(s.tanggalDiterima)}</td>
                          <td className="py-2.5 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => onSelectDetail(s.id)}
                              className="px-2 py-1 text-[11px] font-bold text-blue-600 hover:underline cursor-pointer"
                            >
                              Detail
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: MUTASI KELUAR (Outgoing Transfer) */}
      {/* ========================================================================= */}
      {subTab === 'mutasi-keluar' && (
        <div className="space-y-6">
          {mutasiKeluarSuccess && (
            <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/80 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 flex items-center gap-2.5 text-xs font-bold animate-in fade-in">
              <CheckCircle2 className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>Siswa berhasil diproses Mutasi Keluar. Status siswa kini diperbarui menjadi 'Mutasi Keluar' dan surat keterangan siap dicetak!</span>
            </div>
          )}

          {/* Form Pemrosesan Mutasi Keluar */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 md:p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-base font-extrabold text-rose-700 dark:text-rose-400 flex items-center gap-2">
                  <UserMinus className="w-5 h-5" />
                  <span>Pemrosesan Siswa Mutasi Keluar</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Proses kepindahan peserta didik aktif ke sekolah lain dengan penerbitan nomor surat pindah resmi.
                </p>
              </div>
              <span className="px-2.5 py-1 text-xs font-extrabold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 rounded-full">
                Siswa Keluar / Pindah
              </span>
            </div>

            <form onSubmit={handleProcessMutasiKeluar} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Pilih Siswa Aktif yang Akan Pindah <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={selectedStudentForMutasiKeluarId}
                    onChange={(e) => setSelectedStudentForMutasiKeluarId(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-bold rounded-lg border-2 border-rose-300 dark:border-rose-800 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 cursor-pointer focus:ring-2 focus:ring-rose-500"
                    required
                  >
                    <option value="">-- Pilih Peserta Didik Aktif --</option>
                    {activeStudents.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.namaLengkap} • NIS: {s.noInduk} • {s.kelasSekarang}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Sekolah Tujuan Kepindahan <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={mutasiKeluarData.sekolahTujuan || ''}
                    onChange={(e) => setMutasiKeluarData({ ...mutasiKeluarData, sekolahTujuan: e.target.value })}
                    placeholder="Contoh: SD Negeri 010 Pekanbaru"
                    className="w-full px-3 py-2 text-xs font-bold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Tanggal Pindah / Meninggalkan Sekolah
                  </label>
                  <input
                    type="date"
                    value={mutasiKeluarData.tglMeninggalkan || ''}
                    onChange={(e) => setMutasiKeluarData({ ...mutasiKeluarData, tglMeninggalkan: e.target.value })}
                    className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Dari Tingkat Kelas
                  </label>
                  <input
                    type="text"
                    value={mutasiKeluarData.dariKelas || ''}
                    onChange={(e) => setMutasiKeluarData({ ...mutasiKeluarData, dariKelas: e.target.value })}
                    className="w-full px-3 py-2 text-xs font-bold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-blue-900 dark:text-blue-300"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Nomor Surat Pindah Sekolah
                  </label>
                  <input
                    type="text"
                    value={mutasiKeluarData.noSuratPindah || ''}
                    onChange={(e) => setMutasiKeluarData({ ...mutasiKeluarData, noSuratPindah: e.target.value })}
                    className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Alasan Kepindahan Siswa
                </label>
                <input
                  type="text"
                  value={mutasiKeluarData.alasanPindah || ''}
                  onChange={(e) => setMutasiKeluarData({ ...mutasiKeluarData, alasanPindah: e.target.value })}
                  placeholder="Contoh: Mengikuti perpindahan tugas domisili orang tua"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={!selectedStudentForMutasiKeluarId}
                  className="flex items-center gap-2 px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold rounded-xl shadow-md transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <UserMinus className="w-4 h-4" />
                  <span>Proses & Terbitkan Mutasi Keluar</span>
                </button>
              </div>
            </form>
          </div>

          {/* Tabel Riwayat Siswa Mutasi Keluar */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h4 className="text-xs font-extrabold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
                <UserMinus className="w-4 h-4 text-rose-600" />
                <span>Riwayat Siswa Mutasi Keluar ({studentsMutasiKeluar.length} Siswa)</span>
              </h4>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 text-[11px] font-extrabold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 rounded-full flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                  <span>Tahun Ajar Aktif: {activeTP}</span>
                </span>
              </div>
            </div>

            {/* Banner Status Filter Tahun Ajar Aktif */}
            <div className="px-5 py-2.5 bg-rose-50/60 dark:bg-rose-950/30 border-b border-rose-100 dark:border-rose-900/50 flex flex-col md:flex-row md:items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                <span className="font-bold text-rose-800 dark:text-rose-300">Kebijakan Tampilan:</span>
                <span>
                  {filterMutasiOnlyActiveYear 
                    ? `Hanya menampilkan mutasi keluar pada Tahun Ajar Aktif (${activeTP}). Selain tahun itu disembunyikan.`
                    : `Menampilkan seluruh riwayat siswa mutasi keluar (Semua Tahun).`}
                </span>
                {hiddenMutasiKeluarCount > 0 && filterMutasiOnlyActiveYear && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 text-[10px] font-bold">
                    {hiddenMutasiKeluarCount} mutasi tahun lain disembunyikan
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setFilterMutasiOnlyActiveYear(!filterMutasiOnlyActiveYear)}
                className="px-2.5 py-1 text-[11px] font-bold rounded-lg border border-rose-300 dark:border-rose-700 bg-white dark:bg-slate-800 text-rose-800 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-900/50 transition-colors cursor-pointer self-start md:self-auto shrink-0"
              >
                {filterMutasiOnlyActiveYear ? 'Lihat Semua Tahun' : `Hanya Tahun Aktif (${activeTP})`}
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700 uppercase tracking-wider text-[11px]">
                    <th className="py-2.5 px-3 text-center w-10">No</th>
                    <th className="py-2.5 px-3">Nama Siswa</th>
                    <th className="py-2.5 px-3">NIS / NISN</th>
                    <th className="py-2.5 px-3">Tahun Ajar Mutasi</th>
                    <th className="py-2.5 px-3">Dari Kelas</th>
                    <th className="py-2.5 px-3">Sekolah Tujuan</th>
                    <th className="py-2.5 px-3">Tanggal Pindah</th>
                    <th className="py-2.5 px-3">Alasan Pindah</th>
                    <th className="py-2.5 px-3 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {studentsMutasiKeluar.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-center py-8 text-slate-500">
                        {filterMutasiOnlyActiveYear 
                          ? `Tidak ada siswa yang dimutasi keluar pada Tahun Ajar Aktif (${activeTP}).` 
                          : 'Belum ada siswa yang dimutasi keluar.'}
                        {hiddenMutasiKeluarCount > 0 && filterMutasiOnlyActiveYear && (
                          <div className="mt-1 text-xs text-amber-600 dark:text-amber-400 font-medium">
                            ({hiddenMutasiKeluarCount} siswa dimutasi di tahun pelajaran selain {activeTP} disembunyikan sesuai filter aktif)
                          </div>
                        )}
                      </td>
                    </tr>
                  ) : (
                    studentsMutasiKeluar.map((s, idx) => {
                      const mutasiTP = s.mutasi?.tahunAjaran || getAcademicYearFromDate(s.mutasi?.tglMeninggalkan) || getAcademicYearFromDate(s.mutasi?.dikeluarkanTanggal) || activeTP;
                      const isCurrentTP = mutasiTP === activeTP;
                      return (
                        <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <td className="py-2.5 px-3 text-center font-mono text-slate-500">{idx + 1}</td>
                          <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-slate-100">{s.namaLengkap}</td>
                          <td className="py-2.5 px-3 font-mono text-slate-700 dark:text-slate-300">{s.noInduk} / {s.nisn}</td>
                          <td className="py-2.5 px-3">
                            <span className={cn(
                              "px-2 py-0.5 rounded-md font-mono font-bold text-[10px]",
                              isCurrentTP 
                                ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-300 dark:border-rose-800" 
                                : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                            )}>
                              TP {mutasiTP}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-bold text-blue-700 dark:text-blue-300">{s.mutasi?.dariKelas || s.kelasSekarang}</td>
                          <td className="py-2.5 px-3 font-bold text-rose-700 dark:text-rose-400">{s.mutasi?.sekolahTujuan || '-'}</td>
                          <td className="py-2.5 px-3 text-slate-500">{formatIndonesianDate(s.mutasi?.tglMeninggalkan)}</td>
                          <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">{s.mutasi?.alasanPindah || '-'}</td>
                          <td className="py-2.5 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => onSelectDetail(s.id)}
                              className="px-2 py-1 text-[11px] font-bold text-blue-600 hover:underline cursor-pointer"
                            >
                              Detail
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: TABEL JUMLAH SISWA PER ROMBEL */}
      {/* ========================================================================= */}
      {subTab === 'tabel-rombel' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 md:p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Table className="w-5 h-5 text-[#003399] dark:text-blue-400" />
                  <span>Tabel Rekapitulasi Jumlah Siswa per Rombel</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Distribusi siswa aktif per rombongan belajar (rombel), rincian gender L/P, dan wali kelas untuk Tahun Ajaran <strong className="text-blue-700 dark:text-blue-300">{activeTP}</strong>.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrint}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#003399] hover:bg-[#002266] text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Cetak Rekap Rombel</span>
                </button>
              </div>
            </div>

            {/* Rombel Table */}
            <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-xl">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#003399] text-white font-extrabold uppercase text-[11px] tracking-wider">
                    <th className="py-3 px-3 text-center w-12 border border-blue-900">No</th>
                    <th className="py-3 px-4 border border-blue-900">Rombongan Belajar (Kelas)</th>
                    <th className="py-3 px-4 border border-blue-900">Nama Wali Kelas</th>
                    <th className="py-3 px-3 text-center w-24 border border-blue-900 bg-blue-800">Laki-laki (L)</th>
                    <th className="py-3 px-3 text-center w-24 border border-blue-900 bg-pink-900">Perempuan (P)</th>
                    <th className="py-3 px-3 text-center w-28 border border-blue-900 bg-amber-600">Total Siswa</th>
                    <th className="py-3 px-3 text-center w-24 border border-blue-900">% dari Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700 font-medium">
                  {rombelStats.map((item) => (
                    <tr key={item.kelas} className="hover:bg-blue-50/40 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-3 text-center font-bold text-slate-500 font-mono border-r border-slate-200 dark:border-slate-700">
                        {item.no}
                      </td>
                      <td className="py-3 px-4 font-extrabold text-blue-900 dark:text-blue-300 border-r border-slate-200 dark:border-slate-700">
                        {item.kelas}
                      </td>
                      <td className="py-3 px-4 text-slate-700 dark:text-slate-300 border-r border-slate-200 dark:border-slate-700">
                        <div className="font-bold">{item.waliKelas}</div>
                        <div className="text-[10px] text-slate-400 font-mono">NIP: {item.nipWaliKelas}</div>
                      </td>
                      <td className="py-3 px-3 text-center font-bold text-blue-700 dark:text-blue-400 border-r border-slate-200 dark:border-slate-700 bg-blue-50/30 dark:bg-blue-950/20 font-mono text-sm">
                        {item.jmlL}
                      </td>
                      <td className="py-3 px-3 text-center font-bold text-pink-700 dark:text-pink-400 border-r border-slate-200 dark:border-slate-700 bg-pink-50/30 dark:bg-pink-950/20 font-mono text-sm">
                        {item.jmlP}
                      </td>
                      <td className="py-3 px-3 text-center font-black text-slate-900 dark:text-slate-100 border-r border-slate-200 dark:border-slate-700 bg-amber-50/40 dark:bg-amber-950/20 font-mono text-base">
                        {item.total}
                      </td>
                      <td className="py-3 px-3 text-center font-bold text-slate-600 dark:text-slate-400 font-mono">
                        {item.persentase}%
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-black text-xs border-t-2 border-slate-300 dark:border-slate-600">
                    <td colSpan={3} className="py-3.5 px-4 text-right uppercase tracking-wider border-r border-slate-200 dark:border-slate-700">
                      JUMLAH KESELURUHAN (TOTAL):
                    </td>
                    <td className="py-3.5 px-3 text-center text-blue-700 dark:text-blue-300 border-r border-slate-200 dark:border-slate-700 font-mono text-base bg-blue-100/60 dark:bg-blue-950/50">
                      {totalLaki}
                    </td>
                    <td className="py-3.5 px-3 text-center text-pink-700 dark:text-pink-300 border-r border-slate-200 dark:border-slate-700 font-mono text-base bg-pink-100/60 dark:bg-pink-950/50">
                      {totalPerempuan}
                    </td>
                    <td className="py-3.5 px-3 text-center text-slate-950 dark:text-white border-r border-slate-200 dark:border-slate-700 font-mono text-lg bg-amber-300/80 dark:bg-amber-500/30">
                      {totalActive}
                    </td>
                    <td className="py-3.5 px-3 text-center font-mono text-xs">
                      100%
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Tingkat 1 to 6 Consolidated Summary Table */}
            <div className="pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black uppercase text-[#003399] dark:text-blue-300 tracking-wider flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-amber-500" />
                  <span>Rekapitulasi Konsolidasi per Tingkat Kelas (Tingkat 1 s/d 6)</span>
                </h4>
                <span className="text-[11px] font-bold text-slate-500">
                  Total 6 Tingkat Pendidikan Dasar
                </span>
              </div>

              <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-xl">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-800 text-white font-extrabold uppercase text-[11px] tracking-wider">
                      <th className="py-2.5 px-3 text-center w-12 border border-slate-700">Tingkat</th>
                      <th className="py-2.5 px-4 border border-slate-700">Tingkat Pendidikan</th>
                      <th className="py-2.5 px-3 text-center border border-slate-700">Rombel Variabel Terdaftar</th>
                      <th className="py-2.5 px-3 text-center w-24 border border-slate-700 bg-blue-900">Laki-laki (L)</th>
                      <th className="py-2.5 px-3 text-center w-24 border border-slate-700 bg-pink-950">Perempuan (P)</th>
                      <th className="py-2.5 px-3 text-center w-28 border border-slate-700 bg-amber-700">Total Siswa</th>
                      <th className="py-2.5 px-3 text-center w-24 border border-slate-700">% dari Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700 font-medium">
                    {tingkatStats.map((ts) => (
                      <tr key={`ts-${ts.tingkat}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="py-2.5 px-3 text-center font-bold text-slate-500 font-mono border-r border-slate-200 dark:border-slate-700">
                          {ts.tingkat}
                        </td>
                        <td className="py-2.5 px-4 font-bold text-slate-900 dark:text-slate-100 border-r border-slate-200 dark:border-slate-700">
                          {ts.label}
                        </td>
                        <td className="py-2.5 px-3 text-center border-r border-slate-200 dark:border-slate-700">
                          <div className="flex flex-wrap items-center justify-center gap-1">
                            {ts.rombels.map(r => (
                              <span key={r} className="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 text-[10px] font-bold">
                                {r}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold text-blue-700 dark:text-blue-400 border-r border-slate-200 dark:border-slate-700 bg-blue-50/20 dark:bg-blue-950/10 font-mono">
                          {ts.jmlL}
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold text-pink-700 dark:text-pink-400 border-r border-slate-200 dark:border-slate-700 bg-pink-50/20 dark:bg-pink-950/10 font-mono">
                          {ts.jmlP}
                        </td>
                        <td className="py-2.5 px-3 text-center font-black text-slate-900 dark:text-slate-100 border-r border-slate-200 dark:border-slate-700 bg-amber-50/30 dark:bg-amber-950/10 font-mono text-sm">
                          {ts.total}
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold text-slate-600 dark:text-slate-400 font-mono">
                          {ts.persentase}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-black text-xs border-t border-slate-300 dark:border-slate-600">
                      <td colSpan={3} className="py-2.5 px-4 text-right uppercase border-r border-slate-200 dark:border-slate-700">
                        TOTAL TINGKAT 1 S/D 6:
                      </td>
                      <td className="py-2.5 px-3 text-center text-blue-700 dark:text-blue-300 border-r border-slate-200 dark:border-slate-700 font-mono bg-blue-100/50">
                        {totalLaki}
                      </td>
                      <td className="py-2.5 px-3 text-center text-pink-700 dark:text-pink-300 border-r border-slate-200 dark:border-slate-700 font-mono bg-pink-100/50">
                        {totalPerempuan}
                      </td>
                      <td className="py-2.5 px-3 text-center text-slate-950 dark:text-white border-r border-slate-200 dark:border-slate-700 font-mono font-black text-base bg-amber-300/60">
                        {totalActive}
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono">
                        100%
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Note & Information */}
            <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 text-xs text-blue-900 dark:text-blue-200 space-y-1">
              <p className="font-bold flex items-center gap-1.5">
                <School className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Catatan Administrasi Rombel:</span>
              </p>
              <p className="text-[11.5px] leading-relaxed text-blue-800/80 dark:text-blue-300/80">
                Data siswa aktif SDN 006 SUNGAI BULUH disaring khusus untuk peserta didik yang berada di <strong>Kelas 1 sampai dengan Kelas 6</strong>, dengan rombongan belajar (rombel) tetap variabel sesuai kebutuhan riil sekolah. Setiap perubahan mutasi atau kelas langsung disinkronkan secara *real-time*.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 6: L / P (RASIO GENDER SISWA AKTIF) */}
      {/* ========================================================================= */}
      {subTab === 'gender' && (
        <div className="space-y-6">
          {/* Big Gender Metric Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border-2 border-blue-200 dark:border-blue-900 shadow-sm flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center font-black text-2xl shrink-0">
                L
              </div>
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Siswa Laki-laki</p>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="text-3xl font-black text-blue-600 dark:text-blue-400">{totalLaki}</span>
                  <span className="text-sm font-bold text-slate-400">Siswa ({persenLaki}%)</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">Terdaftar aktif di semua rombel</p>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border-2 border-pink-200 dark:border-pink-900 shadow-sm flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-pink-100 dark:bg-pink-950 text-pink-600 dark:text-pink-400 flex items-center justify-center font-black text-2xl shrink-0">
                P
              </div>
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Siswa Perempuan</p>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="text-3xl font-black text-pink-600 dark:text-pink-400">{totalPerempuan}</span>
                  <span className="text-sm font-bold text-slate-400">Siswa ({persenPerempuan}%)</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">Terdaftar aktif di semua rombel</p>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border-2 border-amber-200 dark:border-amber-900 shadow-sm flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400 flex items-center justify-center font-black text-xl shrink-0">
                L : P
              </div>
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Rasio Gender Keseluruhan</p>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="text-3xl font-black text-amber-600 dark:text-amber-400">
                    {totalLaki} : {totalPerempuan}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">Total {totalActive} peserta didik aktif</p>
              </div>
            </div>
          </div>

          {/* Visual Gender Balance per Rombel */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 md:p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <BarChart2 className="w-5 h-5 text-blue-600" />
                  <span>Grafik Keseimbangan Gender (L/P) per Rombel</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Visualisasi perbandingan proporsi siswa Laki-laki vs Perempuan di setiap tingkat kelas.
                </p>
              </div>

              <div className="flex items-center gap-3 text-xs font-bold">
                <span className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
                  <span className="w-3 h-3 rounded-full bg-blue-600" />
                  <span>Laki-laki (L)</span>
                </span>
                <span className="flex items-center gap-1.5 text-pink-600 dark:text-pink-400">
                  <span className="w-3 h-3 rounded-full bg-pink-500" />
                  <span>Perempuan (P)</span>
                </span>
              </div>
            </div>

            <div className="space-y-4">
              {rombelStats.map((item) => {
                const pL = item.total > 0 ? Math.round((item.jmlL / item.total) * 100) : 0;
                const pP = item.total > 0 ? (100 - pL) : 0;

                return (
                  <div key={item.kelas} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-extrabold text-slate-800 dark:text-slate-200">
                        {item.kelas} <span className="font-normal text-slate-400">({item.total} Siswa)</span>
                      </span>
                      <div className="flex items-center gap-2 font-mono font-bold text-[11px]">
                        <span className="text-blue-600 dark:text-blue-400">L: {item.jmlL} ({pL}%)</span>
                        <span className="text-slate-300">•</span>
                        <span className="text-pink-600 dark:text-pink-400">P: {item.jmlP} ({pP}%)</span>
                      </div>
                    </div>

                    {/* Stacked Bar */}
                    <div className="w-full h-4 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex shadow-inner">
                      <div 
                        style={{ width: `${pL}%` }}
                        className="bg-blue-600 hover:bg-blue-500 transition-all cursor-pointer"
                        title={`${item.kelas}: ${item.jmlL} Laki-laki (${pL}%)`}
                      />
                      <div 
                        style={{ width: `${pP}%` }}
                        className="bg-pink-500 hover:bg-pink-400 transition-all cursor-pointer"
                        title={`${item.kelas}: ${item.jmlP} Perempuan (${pP}%)`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Modal Impor Perubahan Rombel Excel */}
      {isImportRombelModalOpen && (
        <ImportRombelModal
          isOpen={isImportRombelModalOpen}
          onClose={() => setIsImportRombelModalOpen(false)}
        />
      )}
    </div>
  );
};
