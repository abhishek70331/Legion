import { useEffect, useMemo, useState, useCallback } from "react";
import { useAuth } from "./AuthContext.jsx";
import Login from "./Login.jsx";
import UserManagement from "./UserManagement.jsx";

import {
    createRecord,
    getAllRecords,
    searchRecords,
    updateRecord,
    deleteRecord,
    getLast7DaysSummary,
    getDateSummary,
    getErrorMessage,
    checkHealth,
    API_URL
} from "./api.js";

import "./App.css";

/* =========================================================
   TABLE COLUMNS & KEYS
========================================================= */

const COLUMNS = [
    { key: "heading", label: "Heading" },
    { key: "customer_name", label: "Customer Name" },
    { key: "uid", label: "UID", inputType: "text" },
    { key: "record_date", label: "Date" },
    { key: "record_time", label: "Time", inputType: "time" },
    { key: "loc1", label: "Loc-1", inputType: "number" },
    { key: "loc2", label: "Loc-2", inputType: "number" },
    { key: "loc3", label: "Loc-3", inputType: "number" },
    { key: "loc4", label: "Loc-4", inputType: "number" },
    { key: "loc5", label: "Loc-5", inputType: "number" },
    { key: "loc6", label: "Loc-6", inputType: "number" },
    { key: "loc7", label: "Loc-7", inputType: "number" },
    { key: "loc8", label: "Loc-8", inputType: "number" },
    { key: "loc9", label: "Loc-9", inputType: "number" },
    { key: "loc10", label: "Loc-10", inputType: "number" },
    { key: "loc11", label: "Loc-11", inputType: "number" },
    { key: "loc12", label: "Loc-12", inputType: "number" },
];

const LOC_KEYS = [
    "loc1", "loc2", "loc3", "loc4", "loc5", "loc6",
    "loc7", "loc8", "loc9", "loc10", "loc11", "loc12"
];

/* =========================================================
   DATE & TIME UTILITIES
========================================================= */

function getCurrentDate() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function getCurrentTime() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const seconds = String(now.getSeconds()).padStart(2, "0");
    return `${hours}:${minutes}:${seconds}`;
}

function formatTimeForApi(value) {
    if (!value) return "";
    if (value.length === 5) return `${value}:00`;
    return value;
}

function formatDisplayDate(value) {
    if (!value) return "";
    const str = String(value);
    const datePart = str.includes("T") ? str.split("T")[0] : str.slice(0, 10);
    const [year, month, day] = datePart.split("-");
    if (year && month && day) {
        return `${day}-${month}-${year}`;
    }
    return datePart;
}

function formatDisplayTime(value) {
    if (!value) return "";
    return String(value).slice(0, 5);
}

function getCurrentShift(date = new Date()) {
    const hours = date.getHours();
    if (hours >= 6 && hours < 14) {
        return { name: "Shift A", time: "06:00 – 14:00", code: "A", label: "Morning Shift" };
    }
    if (hours >= 14 && hours < 22) {
        return { name: "Shift B", time: "14:00 – 22:00", code: "B", label: "Evening Shift" };
    }
    return { name: "Shift C", time: "22:00 – 06:00", code: "C", label: "Night Shift" };
}

function emptyForm(heading = "", customerName = "") {
    return {
        heading,
        customer_name: customerName,
        uid: "",
        record_date: getCurrentDate(),
        record_time: getCurrentTime(),
        loc1: "", loc2: "", loc3: "", loc4: "", loc5: "", loc6: "",
        loc7: "", loc8: "", loc9: "", loc10: "", loc11: "", loc12: ""
    };
}

function uniqueValues(records, key) {
    return [
        ...new Set(
            records
                .map((row) => (row[key] ?? "").toString().trim())
                .filter(Boolean)
        )
    ].sort((a, b) => a.localeCompare(b));
}

function displayCell(record, key) {
    const value = record[key];
    if (key === "record_date") return formatDisplayDate(value);
    if (key === "record_time") return formatDisplayTime(value);
    return value ?? "";
}

function recordKey(row) {
    return `${row.heading}|${row.customer_name}|${row.uid}`;
}

function calculateReadingStats(formData) {
    const values = LOC_KEYS
        .map((k) => formData[k])
        .filter((v) => v !== "" && v !== null && v !== undefined && !isNaN(Number(v)))
        .map(Number);

    if (values.length === 0) {
        return { count: 0, min: "—", max: "—", avg: "—" };
    }

    const min = Math.min(...values);
    const max = Math.max(...values);
    const sum = values.reduce((acc, curr) => acc + curr, 0);
    const avg = (sum / values.length).toFixed(2);

    return {
        count: values.length,
        min: min.toFixed(2),
        max: max.toFixed(2),
        avg
    };
}

function exportRecordsToCSV(records, filename = "legion_ultrasonic_records.csv") {
    if (!records || !records.length) return;
    const headers = [
        "Heading", "Customer Name", "UID", "Date", "Time",
        "Loc 1", "Loc 2", "Loc 3", "Loc 4", "Loc 5", "Loc 6",
        "Loc 7", "Loc 8", "Loc 9", "Loc 10", "Loc 11", "Loc 12"
    ];

    const escapeCsv = (val) => {
        if (val === null || val === undefined) return "";
        const str = String(val);
        if (str.includes(",") || str.includes("\"") || str.includes("\n")) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
    };

    const rows = records.map((r) => [
        escapeCsv(r.heading),
        escapeCsv(r.customer_name),
        escapeCsv(r.uid),
        escapeCsv(formatDisplayDate(r.record_date)),
        escapeCsv(formatDisplayTime(r.record_time)),
        escapeCsv(r.loc1),
        escapeCsv(r.loc2),
        escapeCsv(r.loc3),
        escapeCsv(r.loc4),
        escapeCsv(r.loc5),
        escapeCsv(r.loc6),
        escapeCsv(r.loc7),
        escapeCsv(r.loc8),
        escapeCsv(r.loc9),
        escapeCsv(r.loc10),
        escapeCsv(r.loc11),
        escapeCsv(r.loc12)
    ]);

    const csvContent = [headers.join(","), ...rows.map(e => e.join(","))].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/* =========================================================
   RECORDS TABLE COMPONENT
========================================================= */

function RecordsTable({ rows, isAdmin = false, onEdit, onDelete, sortField, sortDirection, onSort }) {
    if (!rows.length) {
        return (
            <div className="empty-state">
                <span className="empty-state-icon">📋</span>
                <strong>No records found</strong>
                <span>Try adjusting your search criteria or log a new inspection.</span>
            </div>
        );
    }

    return (
        <div className="table-scroll">
            <table className="data-table">
                <thead>
                    <tr>
                        {COLUMNS.map((col) => {
                            const isSortable = ["heading", "customer_name", "uid", "record_date", "record_time"].includes(col.key);
                            const isSorted = sortField === col.key;
                            return (
                                <th
                                    key={col.key}
                                    className={isSortable ? "th-sortable" : ""}
                                    onClick={isSortable && onSort ? () => onSort(col.key) : undefined}
                                >
                                    <div className="th-content">
                                        <span>{col.label}</span>
                                        {isSortable && (
                                            <span className="sort-arrow">
                                                {isSorted ? (sortDirection === "asc" ? " ▲" : " ▼") : " ↕"}
                                            </span>
                                        )}
                                    </div>
                                </th>
                            );
                        })}
                        {isAdmin && <th className="record-actions-heading">Actions</th>}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => (
                        <tr key={recordKey(row)}>
                            {COLUMNS.map((col) => (
                                <td key={col.key} className={col.key.startsWith("loc") ? "td-reading" : ""}>
                                    {displayCell(row, col.key)}
                                </td>
                            ))}
                            {isAdmin && (
                                <td className="record-actions-cell">
                                    <button
                                        type="button"
                                        className="btn btn-secondary small-btn"
                                        onClick={() => onEdit(row)}
                                        title="Edit this record"
                                    >
                                        Edit
                                    </button>
                                    <button
                                        type="button"
                                        className="btn btn-danger small-btn"
                                        onClick={() => onDelete(row)}
                                        title="Delete this record"
                                    >
                                        Delete
                                    </button>
                                </td>
                            )}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

/* =========================================================
   MAIN DASHBOARD APPLICATION
========================================================= */

function MainApp() {
    const { user, logout } = useAuth();
    const isAdmin = ["admin", "superadmin"].includes(user?.role);
    const isSuperAdmin = user?.role === "superadmin";

    // View Navigation Tabs
    const [activeTab, setActiveTab] = useState("overview");

    // Real-time clock & shift
    const [clock, setClock] = useState(() => new Date());
    const currentShift = useMemo(() => getCurrentShift(clock), [clock]);

    // Backend connectivity status
    const [backendStatus, setBackendStatus] = useState({ online: true, checking: false, latency: null });

    // Modals
    const [editingRecord, setEditingRecord] = useState(null);
    const [editSaving, setEditSaving] = useState(false);
    const [editMessage, setEditMessage] = useState({ type: "", text: "" });

    const [deleteModalRecord, setDeleteModalRecord] = useState(null);
    const [deleteSubmitting, setDeleteSubmitting] = useState(false);

    // Form state (New Inspection)
    const [form, setForm] = useState(() => emptyForm());
    const [saveMessage, setSaveMessage] = useState({ type: "", text: "" });
    const [saving, setSaving] = useState(false);

    // Search state
    const [searchHeading, setSearchHeading] = useState("");
    const [searchCustomer, setSearchCustomer] = useState("");
    const [searchUid, setSearchUid] = useState("");
    const [searchDate, setSearchDate] = useState("");
    const [searchResults, setSearchResults] = useState([]);
    const [searchMessage, setSearchMessage] = useState({ type: "", text: "" });
    const [searching, setSearching] = useState(false);

    // Records Explorer state
    const [allRecords, setAllRecords] = useState([]);
    const [recordLimit, setRecordLimit] = useState(50);
    const [allMessage, setAllMessage] = useState({ type: "", text: "" });
    const [loadingAll, setLoadingAll] = useState(false);

    // Sorting state
    const [sortField, setSortField] = useState("record_date");
    const [sortDirection, setSortDirection] = useState("desc");

    // 7-day summary state
    const [last7Days, setLast7Days] = useState([]);
    const [loadingLast7Days, setLoadingLast7Days] = useState(false);
    const [last7DaysMessage, setLast7DaysMessage] = useState({ type: "", text: "" });

    // Date-wise summary state
    const [selectedSummaryDate, setSelectedSummaryDate] = useState(() => {
        const now = new Date();
        const hour = now.getHours();
        const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        if (hour < 6) base.setDate(base.getDate() - 1);
        return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(base.getDate()).padStart(2, "0")}`;
    });
    const [dateSummary, setDateSummary] = useState(null);
    const [dateSummaryLoading, setDateSummaryLoading] = useState(false);
    const [dateSummaryMessage, setDateSummaryMessage] = useState({ type: "", text: "" });

    // Check backend health
    const verifyBackend = useCallback(async () => {
        const start = performance.now();
        setBackendStatus(prev => ({ ...prev, checking: true }));
        const res = await checkHealth();
        const latency = Math.round(performance.now() - start);
        setBackendStatus({
            online: res.ok,
            checking: false,
            latency: res.ok ? latency : null
        });
    }, []);

    // Load records
    const loadAllRecords = useCallback(async (limit = recordLimit) => {
        setLoadingAll(true);
        setAllMessage({ type: "", text: "" });
        try {
            const data = await getAllRecords(limit);
            const rows = Array.isArray(data) ? data : [];
            setAllRecords(rows);
            if (rows.length === 0) {
                setAllMessage({ type: "info", text: "No records found in database." });
            }
        } catch (error) {
            setAllRecords([]);
            setAllMessage({
                type: "error",
                text: getErrorMessage(error, "Failed to load inspection records.")
            });
        } finally {
            setLoadingAll(false);
        }
    }, [recordLimit]);

    // Load 7-day summary
    const loadLast7Days = useCallback(async () => {
        setLoadingLast7Days(true);
        setLast7DaysMessage({ type: "", text: "" });
        try {
            const data = await getLast7DaysSummary();
            setLast7Days(Array.isArray(data) ? data : []);
        } catch (error) {
            setLast7Days([]);
            setLast7DaysMessage({
                type: "error",
                text: getErrorMessage(error, "Failed to load shift summary.")
            });
        } finally {
            setLoadingLast7Days(false);
        }
    }, []);

    const loadDateSummary = async () => {
        if (!selectedSummaryDate) return;
        setDateSummaryLoading(true);
        setDateSummaryMessage({ type: "", text: "" });
        try {
            const data = await getDateSummary(selectedSummaryDate);
            setDateSummary(data);
        } catch (error) {
            setDateSummary(null);
            setDateSummaryMessage({
                type: "error",
                text: getErrorMessage(error, "Failed to load summary for selected date.")
            });
        } finally {
            setDateSummaryLoading(false);
        }
    };

    // Live clock ticker
    useEffect(() => {
        const interval = setInterval(() => {
            const now = new Date();
            setClock(now);
            // Keep date/time current in unsubmitted form
            setForm((prev) => ({
                ...prev,
                record_date: getCurrentDate(),
                record_time: getCurrentTime()
            }));
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    // Initial load & periodic refresh
    useEffect(() => {
        verifyBackend();
        loadAllRecords();
        loadLast7Days();

        const healthInterval = setInterval(verifyBackend, 30000);
        const refreshInterval = setInterval(loadLast7Days, 15000);

        return () => {
            clearInterval(healthInterval);
            clearInterval(refreshInterval);
        };
    }, [verifyBackend, loadAllRecords, loadLast7Days]);

    // Form handlers
    const handleFormChange = (key, value) => {
        setForm((prev) => ({ ...prev, [key]: value }));
        setSaveMessage({ type: "", text: "" });
    };

    const handleClearReadings = () => {
        setForm((prev) => {
            const updated = { ...prev };
            LOC_KEYS.forEach(key => { updated[key] = ""; });
            return updated;
        });
    };

    const handleResetForm = () => {
        setForm(emptyForm(form.heading, form.customer_name));
        setSaveMessage({ type: "", text: "" });
    };

    const handleSave = async () => {
        const heading = form.heading.trim();
        const customerName = form.customer_name.trim();
        const uid = form.uid.trim();
        const recordDate = getCurrentDate();
        const recordTime = formatTimeForApi(getCurrentTime());

        if (!heading || !customerName || !uid) {
            setSaveMessage({
                type: "error",
                text: "Heading, Customer Name, and UID are mandatory."
            });
            return;
        }

        setSaving(true);
        setSaveMessage({ type: "", text: "" });

        try {
            const payload = {
                heading,
                customer_name: customerName,
                uid,
                record_date: recordDate,
                record_time: recordTime
            };

            LOC_KEYS.forEach((key) => {
                payload[key] = (form[key] ?? "").trim();
            });

            const createResponse = await createRecord(payload);

            // Immediate verification check
            const verificationRows = await searchRecords({
                heading,
                customer_name: customerName,
                uid,
                record_date: recordDate
            });

            const normalizedHeading = String(heading).trim().toUpperCase();
            const normalizedCustomer = String(customerName).trim().toUpperCase();
            const normalizedUid = String(uid).trim().toUpperCase();

            const savedRow = verificationRows.find((row) =>
                String(row.heading || "").trim().toUpperCase() === normalizedHeading &&
                String(row.customer_name || "").trim().toUpperCase() === normalizedCustomer &&
                String(row.uid || "").trim().toUpperCase() === normalizedUid &&
                String(row.record_date || "").slice(0, 10) === String(recordDate).slice(0, 10)
            );

            if (!createResponse?.data || !savedRow) {
                throw new Error("Record could not be verified in the database. Please try again.");
            }

            setSaveMessage({
                type: "success",
                text: `Inspection for ${customerName} (UID: ${uid}) verified and saved successfully.`
            });

            // Keep heading and customer name for rapid next entry, clear UID and readings
            setForm((prev) => ({
                ...emptyForm(heading, customerName),
                record_date: getCurrentDate(),
                record_time: getCurrentTime()
            }));

            // Refresh recent lists and shift summaries
            await loadAllRecords();
            await loadLast7Days();
        } catch (error) {
            setSaveMessage({
                type: "error",
                text: getErrorMessage(error, "Failed to save record.")
            });
        } finally {
            setSaving(false);
        }
    };

    // Edit record handlers
    const openEditor = (row) => {
        setEditingRecord({
            ...row,
            _original_heading: row.heading,
            _original_customer_name: row.customer_name,
            _original_uid: row.uid,
            record_date: String(row.record_date || "").slice(0, 10),
            record_time: row.record_time ? String(row.record_time).slice(0, 5) : ""
        });
        setEditMessage({ type: "", text: "" });
    };

    const handleUpdateRecord = async (e) => {
        e.preventDefault();
        if (!editingRecord) return;

        setEditSaving(true);
        setEditMessage({ type: "", text: "" });

        try {
            await updateRecord({
                original_heading: editingRecord._original_heading,
                original_customer_name: editingRecord._original_customer_name,
                original_uid: editingRecord._original_uid,
                heading: editingRecord.heading,
                customer_name: editingRecord.customer_name,
                uid: editingRecord.uid,
                record_date: String(editingRecord.record_date || "").slice(0, 10),
                record_time: formatTimeForApi(editingRecord.record_time),
                ...Object.fromEntries(LOC_KEYS.map((key) => [key, editingRecord[key] ?? ""]))
            });

            setEditingRecord(null);
            setAllMessage({ type: "success", text: "Record updated successfully." });
            await loadAllRecords();
            await loadLast7Days();
        } catch (error) {
            setEditMessage({ type: "error", text: getErrorMessage(error, "Failed to update record.") });
        } finally {
            setEditSaving(false);
        }
    };

    // Delete record modal handlers
    const openDeleteModal = (row) => {
        setDeleteModalRecord(row);
    };

    const handleDeleteConfirm = async () => {
        if (!deleteModalRecord || !isAdmin) return;
        setDeleteSubmitting(true);
        try {
            await deleteRecord({
                heading: deleteModalRecord.heading,
                customer_name: deleteModalRecord.customer_name,
                uid: deleteModalRecord.uid
            });
            setAllMessage({ type: "success", text: `Record ${deleteModalRecord.uid} deleted successfully.` });
            setDeleteModalRecord(null);
            await loadAllRecords();
            await loadLast7Days();
        } catch (error) {
            setAllMessage({ type: "error", text: getErrorMessage(error, "Failed to delete record.") });
        } finally {
            setDeleteSubmitting(false);
        }
    };

    // Search handlers
    const handleSearch = async (e) => {
        e.preventDefault();
        const heading = searchHeading.trim();
        const customerName = searchCustomer.trim();
        const uid = searchUid.trim();

        if (!heading && !customerName && !uid && !searchDate) {
            setSearchMessage({
                type: "error",
                text: "Please enter at least one filter criterion (Heading, Customer, UID, or Date)."
            });
            setSearchResults([]);
            return;
        }

        setSearching(true);
        setSearchMessage({ type: "", text: "" });
        setSearchResults([]);

        try {
            const data = await searchRecords({
                heading,
                customer_name: customerName,
                uid,
                record_date: searchDate
            });
            setSearchResults(data);
            if (data.length === 0) {
                setSearchMessage({
                    type: "info",
                    text: "No matching inspection records found."
                });
            }
        } catch (error) {
            setSearchResults([]);
            setSearchMessage({
                type: "error",
                text: getErrorMessage(error, "Search query failed.")
            });
        } finally {
            setSearching(false);
        }
    };

    const handleClearSearch = () => {
        setSearchHeading("");
        setSearchCustomer("");
        setSearchUid("");
        setSearchDate("");
        setSearchResults([]);
        setSearchMessage({ type: "", text: "" });
    };

    // Table sorting
    const handleSort = (field) => {
        if (sortField === field) {
            setSortDirection(prev => prev === "asc" ? "desc" : "asc");
        } else {
            setSortField(field);
            setSortDirection("asc");
        }
    };

    const sortRows = (rows) => {
        if (!sortField) return rows;
        return [...rows].sort((a, b) => {
            let valA = a[sortField] ?? "";
            let valB = b[sortField] ?? "";
            if (typeof valA === "string") valA = valA.toLowerCase();
            if (typeof valB === "string") valB = valB.toLowerCase();
            if (valA < valB) return sortDirection === "asc" ? -1 : 1;
            if (valA > valB) return sortDirection === "asc" ? 1 : -1;
            return 0;
        });
    };

    // Derived options & stats
    const headingOptions = useMemo(() => uniqueValues(allRecords, "heading"), [allRecords]);
    const customerOptions = useMemo(() => uniqueValues(allRecords, "customer_name"), [allRecords]);
    const liveStats = useMemo(() => calculateReadingStats(form), [form]);

    const weekTotal = useMemo(
        () => last7Days.reduce((sum, day) => sum + Number(day.data_count || 0), 0),
        [last7Days]
    );

    const shiftTotals = useMemo(() => {
        return last7Days.reduce(
            (acc, day) => {
                acc.a += Number(day.a_shift_count || 0);
                acc.b += Number(day.b_shift_count || 0);
                acc.c += Number(day.c_shift_count || 0);
                return acc;
            },
            { a: 0, b: 0, c: 0 }
        );
    }, [last7Days]);

    const todaySummary = last7Days[0];
    const roleTitle = isSuperAdmin ? "Super Admin" : isAdmin ? "Admin" : "Operator";

    const formattedClock = clock.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
    });

    const formattedDate = clock.toLocaleDateString("en-IN", {
        weekday: "short",
        day: "2-digit",
        month: "short",
        year: "numeric"
    });

    return (
        <div className="app">
            {/* =================================================
                GLOBAL TOP HEADER
            ================================================= */}
            <header className="company-header">
                <div className="header-row">
                    <div className="header-brand-group">
                        <div className="header-logo-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                            </svg>
                        </div>
                        <div>
                            <h1 className="header-title">LEGION SYSTEM</h1>
                            <span className="header-title-sub">Insulator Ultrasonic Testing Data Suite</span>
                        </div>
                    </div>

                    <div className="header-center-info">
                        {/* Live Shift Pill */}
                        <div className={`shift-pill-badge shift-${currentShift.code.toLowerCase()}`}>
                            <span className="shift-indicator-dot" />
                            <span className="shift-name">{currentShift.name}</span>
                            <span className="shift-time">{currentShift.time}</span>
                        </div>

                        {/* Connection Health */}
                        <div
                            className={`health-pill ${backendStatus.online ? "health-online" : "health-offline"}`}
                            title={`Backend API: ${API_URL}`}
                            onClick={verifyBackend}
                        >
                            <span className="health-dot" />
                            <span>{backendStatus.online ? `API Online ${backendStatus.latency ? `(${backendStatus.latency}ms)` : ""}` : "API Offline"}</span>
                        </div>
                    </div>

                    <div className="header-user">
                        <div className="header-datetime">
                            <span className="header-clock">{formattedClock}</span>
                            <span className="header-date">{formattedDate}</span>
                        </div>

                        <div className="user-profile-pill">
                            <div className="user-avatar-circle">{user?.username?.slice(0, 2).toUpperCase() || "OP"}</div>
                            <div className="user-info-text">
                                <span className="user-name">{user?.username}</span>
                                <span className={`role-badge role-${user?.role}`}>{roleTitle}</span>
                            </div>
                        </div>

                        <button type="button" className="btn btn-outline-light btn-signout" onClick={logout} title="Sign out of current workstation">
                            Sign out
                        </button>
                    </div>
                </div>

                {/* =================================================
                    PRIMARY NAVIGATION TABS
                ================================================= */}
                <nav className="tab-navigation">
                    <div className="tab-navigation-inner">
                        <button
                            type="button"
                            className={`nav-tab ${activeTab === "overview" ? "active" : ""}`}
                            onClick={() => setActiveTab("overview")}
                        >
                            <span className="nav-tab-icon">📊</span>
                            <span>Overview & Shift KPI</span>
                        </button>

                        <button
                            type="button"
                            className={`nav-tab ${activeTab === "entry" ? "active" : ""}`}
                            onClick={() => setActiveTab("entry")}
                        >
                            <span className="nav-tab-icon">➕</span>
                            <span>New Inspection</span>
                        </button>

                        <button
                            type="button"
                            className={`nav-tab ${activeTab === "records" ? "active" : ""}`}
                            onClick={() => setActiveTab("records")}
                        >
                            <span className="nav-tab-icon">📋</span>
                            <span>Records Explorer</span>
                            {allRecords.length > 0 && <span className="tab-count-badge">{allRecords.length}</span>}
                        </button>

                        <button
                            type="button"
                            className={`nav-tab ${activeTab === "shifts" ? "active" : ""}`}
                            onClick={() => setActiveTab("shifts")}
                        >
                            <span className="nav-tab-icon">📈</span>
                            <span>Shift Analytics</span>
                        </button>

                        {isSuperAdmin && (
                            <button
                                type="button"
                                className={`nav-tab ${activeTab === "users" ? "active" : ""}`}
                                onClick={() => setActiveTab("users")}
                            >
                                <span className="nav-tab-icon">👥</span>
                                <span>User Management</span>
                            </button>
                        )}
                    </div>
                </nav>
            </header>

            <main className="content">
                {/* =================================================
                    TAB 1: OVERVIEW & SHIFT KPI
                ================================================= */}
                {activeTab === "overview" && (
                    <div className="tab-pane active-pane">
                        <section className="dashboard-hero">
                            <div className="dashboard-hero-copy">
                                <span className="hero-overline">OPERATIONAL STATUS</span>
                                <h2>Insulator Ultrasonic Testing Center</h2>
                                <p>Live monitoring of active shift inspections, daily test volumes, and workstation records.</p>
                            </div>
                            <div className="hero-quick-actions">
                                <button type="button" className="btn btn-primary" onClick={() => setActiveTab("entry")}>
                                    ➕ New Inspection Entry
                                </button>
                                <button type="button" className="btn btn-secondary" onClick={() => setActiveTab("records")}>
                                    🔍 Search Records
                                </button>
                            </div>
                        </section>

                        {/* KPI GRID */}
                        <section className="kpi-grid">
                            <article className="kpi-card kpi-highlight">
                                <div className="kpi-header">
                                    <span>Current Shift</span>
                                    <span className="kpi-badge shift-tag">{currentShift.name}</span>
                                </div>
                                <strong className="kpi-value">{currentShift.label}</strong>
                                <small className="kpi-sub">{currentShift.time} window</small>
                            </article>

                            <article className="kpi-card">
                                <div className="kpi-header">
                                    <span>Today Total Inspections</span>
                                    <span className="kpi-badge">Today</span>
                                </div>
                                <strong className="kpi-value">{todaySummary ? todaySummary.data_count : "0"}</strong>
                                <small className="kpi-sub">
                                    A: {todaySummary?.a_shift_count ?? 0} | B: {todaySummary?.b_shift_count ?? 0} | C: {todaySummary?.c_shift_count ?? 0}
                                </small>
                            </article>

                            <article className="kpi-card">
                                <div className="kpi-header">
                                    <span>7-Day Total</span>
                                    <span className="kpi-badge">Cumulative</span>
                                </div>
                                <strong className="kpi-value">{loadingLast7Days ? "…" : weekTotal}</strong>
                                <small className="kpi-sub">Tests recorded across past week</small>
                            </article>

                            <article className="kpi-card">
                                <div className="kpi-header">
                                    <span>Workspace Operator</span>
                                    <span className="kpi-badge role-tag">{roleTitle}</span>
                                </div>
                                <strong className="kpi-value">{user?.username}</strong>
                                <small className="kpi-sub">Session secure · Single login active</small>
                            </article>
                        </section>

                        {/* SHIFT DISTRIBUTION PROGRESS BAR */}
                        <section className="panel shift-progress-panel">
                            <div className="section-heading-row">
                                <div>
                                    <span className="section-kicker">7-DAY SHIFT COMPOSITION</span>
                                    <h3>Shift Production Volume Breakdown</h3>
                                </div>
                                <span className="shift-total-summary">Total: <strong>{weekTotal}</strong> records</span>
                            </div>

                            <div className="shift-stacked-bar" title="Shift breakdown over last 7 days">
                                <div
                                    className="bar-segment bar-shift-a"
                                    style={{ width: `${weekTotal ? (shiftTotals.a / weekTotal) * 100 : 33.3}%` }}
                                >
                                    {shiftTotals.a > 0 && <span>A ({shiftTotals.a})</span>}
                                </div>
                                <div
                                    className="bar-segment bar-shift-b"
                                    style={{ width: `${weekTotal ? (shiftTotals.b / weekTotal) * 100 : 33.3}%` }}
                                >
                                    {shiftTotals.b > 0 && <span>B ({shiftTotals.b})</span>}
                                </div>
                                <div
                                    className="bar-segment bar-shift-c"
                                    style={{ width: `${weekTotal ? (shiftTotals.c / weekTotal) * 100 : 33.3}%` }}
                                >
                                    {shiftTotals.c > 0 && <span>C ({shiftTotals.c})</span>}
                                </div>
                            </div>

                            <div className="shift-legend">
                                <div className="legend-item"><span className="legend-color legend-a" /> <span>Shift A (06:00 - 14:00): <strong>{shiftTotals.a}</strong></span></div>
                                <div className="legend-item"><span className="legend-color legend-b" /> <span>Shift B (14:00 - 22:00): <strong>{shiftTotals.b}</strong></span></div>
                                <div className="legend-item"><span className="legend-color legend-c" /> <span>Shift C (22:00 - 06:00): <strong>{shiftTotals.c}</strong></span></div>
                            </div>
                        </section>

                        {/* RECENT 5 ACTIVITY PREVIEW */}
                        <section className="panel">
                            <div className="section-heading-row">
                                <div>
                                    <span className="section-kicker">LATEST ACTIVITY</span>
                                    <h2>Recently Logged Inspections</h2>
                                    <p className="section-subtitle">Real-time feed of recent test records stored in the database.</p>
                                </div>
                                <button type="button" className="btn btn-secondary" onClick={() => setActiveTab("records")}>
                                    View All Records ({allRecords.length}) →
                                </button>
                            </div>

                            <RecordsTable
                                rows={sortRows(allRecords.slice(0, 5))}
                                isAdmin={isAdmin}
                                onEdit={openEditor}
                                onDelete={openDeleteModal}
                                sortField={sortField}
                                sortDirection={sortDirection}
                                onSort={handleSort}
                            />
                        </section>
                    </div>
                )}

                {/* =================================================
                    TAB 2: NEW INSPECTION (DATA ENTRY)
                ================================================= */}
                {activeTab === "entry" && (
                    <div className="tab-pane active-pane">
                        <section className="panel entry-panel">
                            <div className="section-heading-row">
                                <div>
                                    <span className="section-kicker">WORKSTATION DATA CAPTURE</span>
                                    <h2>Record New Ultrasonic Test</h2>
                                    <p className="section-subtitle">
                                        Date & Time are stamped automatically. Enter reading values for points Loc-1 through Loc-12.
                                    </p>
                                </div>
                                <div className="entry-status-badges">
                                    <span className="entry-shift-badge">Logging to: <strong>{currentShift.name}</strong></span>
                                </div>
                            </div>

                            {/* AUTO-COMPLETION DATALISTS */}
                            <datalist id="heading-options">
                                {headingOptions.map((opt) => (
                                    <option key={opt} value={opt} />
                                ))}
                            </datalist>

                            <datalist id="customer-options">
                                {customerOptions.map((opt) => (
                                    <option key={opt} value={opt} />
                                ))}
                            </datalist>

                            <div className="record-form">
                                {/* SECTION: RECORD IDENTIFIERS */}
                                <div className="form-subpanel metadata-subpanel">
                                    <div className="subpanel-header">
                                        <span className="subpanel-number">1</span>
                                        <div>
                                            <h4>Inspection Identifiers</h4>
                                            <p>Specify workpiece, customer, and UID reference.</p>
                                        </div>
                                    </div>

                                    <div className="field-grid field-grid-main">
                                        <label className="field">
                                            <span className="field-label-req">Heading / Category *</span>
                                            <input
                                                type="text"
                                                list="heading-options"
                                                value={form.heading}
                                                onChange={(e) => handleFormChange("heading", e.target.value)}
                                                placeholder="e.g. 66KV Post Insulator"
                                                required
                                            />
                                        </label>

                                        <label className="field">
                                            <span className="field-label-req">Customer Name *</span>
                                            <input
                                                type="text"
                                                list="customer-options"
                                                value={form.customer_name}
                                                onChange={(e) => handleFormChange("customer_name", e.target.value)}
                                                placeholder="e.g. PowerGrid Corp"
                                                required
                                            />
                                        </label>

                                        <label className="field">
                                            <span className="field-label-req">UID Number *</span>
                                            <input
                                                type="text"
                                                value={form.uid}
                                                onChange={(e) => handleFormChange("uid", e.target.value)}
                                                placeholder="e.g. UID-98214"
                                                required
                                            />
                                        </label>

                                        <label className="field">
                                            <span>Inspection Date (Auto)</span>
                                            <input
                                                type="date"
                                                value={form.record_date}
                                                readOnly
                                                className="readonly-input"
                                            />
                                        </label>

                                        <label className="field">
                                            <span>Timestamp (Auto)</span>
                                            <input
                                                type="time"
                                                value={form.record_time.slice(0, 5)}
                                                readOnly
                                                className="readonly-input"
                                            />
                                        </label>
                                    </div>
                                </div>

                                {/* SECTION: 12 ULTRASONIC TEST READINGS */}
                                <div className="form-subpanel readings-subpanel">
                                    <div className="subpanel-header subpanel-header-readings">
                                        <div className="subpanel-header-left">
                                            <span className="subpanel-number">2</span>
                                            <div>
                                                <h4>Ultrasonic Location Readings</h4>
                                                <p>Enter thickness / attenuation values (Loc-1 to Loc-12).</p>
                                            </div>
                                        </div>

                                        {/* LIVE SENSOR METRICS */}
                                        <div className="live-metrics-banner">
                                            <div className="metric-chip">
                                                <span>Points:</span>
                                                <strong>{liveStats.count} / 12</strong>
                                            </div>
                                            <div className="metric-chip">
                                                <span>Min:</span>
                                                <strong>{liveStats.min}</strong>
                                            </div>
                                            <div className="metric-chip">
                                                <span>Max:</span>
                                                <strong>{liveStats.max}</strong>
                                            </div>
                                            <div className="metric-chip">
                                                <span>Average:</span>
                                                <strong>{liveStats.avg}</strong>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="field-grid field-grid-loc">
                                        {COLUMNS.filter((col) => LOC_KEYS.includes(col.key)).map((col, idx) => (
                                            <label className="field loc-field" key={col.key}>
                                                <span className="loc-label-badge">
                                                    <span>{col.label}</span>
                                                    <span className="loc-index">#{idx + 1}</span>
                                                </span>
                                                <input
                                                    type="number"
                                                    step="any"
                                                    inputMode="decimal"
                                                    value={form[col.key] ?? ""}
                                                    onChange={(e) => handleFormChange(col.key, e.target.value)}
                                                    placeholder="0.00"
                                                />
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* FEEDBACK ALERT */}
                            {saveMessage.text && (
                                <div className={`form-feedback-alert alert-${saveMessage.type}`}>
                                    <span className="feedback-icon">{saveMessage.type === "success" ? "✓" : "!"}</span>
                                    <span>{saveMessage.text}</span>
                                </div>
                            )}

                            {/* ACTION BUTTONS */}
                            <div className="form-action-bar">
                                <div className="action-buttons-left">
                                    <button
                                        type="button"
                                        className="btn btn-secondary"
                                        onClick={handleClearReadings}
                                        title="Clear all 12 location inputs"
                                    >
                                        Clear Readings
                                    </button>
                                    <button
                                        type="button"
                                        className="btn btn-secondary"
                                        onClick={handleResetForm}
                                        title="Reset the entire form"
                                    >
                                        Reset Form
                                    </button>
                                </div>

                                <button
                                    type="button"
                                    className="btn btn-primary btn-save-record"
                                    onClick={handleSave}
                                    disabled={saving}
                                >
                                    {saving ? (
                                        <>
                                            <span className="btn-spinner" />
                                            <span>Saving & Verifying...</span>
                                        </>
                                    ) : (
                                        <>
                                            <span>Save Inspection Record</span>
                                            <span className="btn-shortcut">↵</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </section>
                    </div>
                )}

                {/* =================================================
                    TAB 3: RECORDS EXPLORER
                ================================================= */}
                {activeTab === "records" && (
                    <div className="tab-pane active-pane">
                        {/* SEARCH & FILTER SECTION */}
                        <section className="panel search-filter-panel">
                            <div className="section-heading-row">
                                <div>
                                    <span className="section-kicker">DATABASE QUERY</span>
                                    <h2>Filter & Search Inspection Records</h2>
                                    <p className="section-subtitle">Search across test archives by Heading, Customer, UID, or Date.</p>
                                </div>
                                <div className="export-action-group">
                                    <button
                                        type="button"
                                        className="btn btn-secondary btn-export"
                                        onClick={() => exportRecordsToCSV(searchResults.length > 0 ? searchResults : allRecords)}
                                        disabled={!allRecords.length && !searchResults.length}
                                        title="Export current table data to CSV file"
                                    >
                                        <span className="btn-icon">⬇</span>
                                        <span>Export to CSV</span>
                                    </button>
                                </div>
                            </div>

                            <form className="search-grid" onSubmit={handleSearch}>
                                <div className="search-field">
                                    <label htmlFor="search-heading">Heading</label>
                                    <input
                                        id="search-heading"
                                        type="text"
                                        list="heading-options"
                                        value={searchHeading}
                                        onChange={(e) => setSearchHeading(e.target.value)}
                                        placeholder="Filter heading..."
                                    />
                                </div>

                                <div className="search-field">
                                    <label htmlFor="search-customer">Customer Name</label>
                                    <input
                                        id="search-customer"
                                        type="text"
                                        list="customer-options"
                                        value={searchCustomer}
                                        onChange={(e) => setSearchCustomer(e.target.value)}
                                        placeholder="Filter customer..."
                                    />
                                </div>

                                <div className="search-field">
                                    <label htmlFor="search-uid">UID Number</label>
                                    <input
                                        id="search-uid"
                                        type="text"
                                        value={searchUid}
                                        onChange={(e) => setSearchUid(e.target.value)}
                                        placeholder="Exact or partial UID..."
                                    />
                                </div>

                                <div className="search-field">
                                    <label htmlFor="search-date">Inspection Date</label>
                                    <input
                                        id="search-date"
                                        type="date"
                                        value={searchDate}
                                        onChange={(e) => setSearchDate(e.target.value)}
                                    />
                                </div>

                                <div className="search-buttons">
                                    <button type="submit" className="btn btn-primary" disabled={searching}>
                                        {searching ? "Searching..." : "Apply Filters"}
                                    </button>
                                    <button type="button" className="btn btn-secondary" onClick={handleClearSearch}>
                                        Clear
                                    </button>
                                </div>
                            </form>

                            {searchMessage.text && (
                                <p className={`message message-${searchMessage.type}`}>{searchMessage.text}</p>
                            )}
                        </section>

                        {/* SEARCH RESULTS (IF ACTIVE) */}
                        {searchResults.length > 0 && (
                            <section className="panel search-results-panel">
                                <div className="section-heading-row">
                                    <div>
                                        <span className="section-kicker">QUERY RESULTS</span>
                                        <h2>Search Matches ({searchResults.length})</h2>
                                    </div>
                                    <button
                                        type="button"
                                        className="btn btn-secondary small-btn"
                                        onClick={handleClearSearch}
                                    >
                                        Dismiss Search
                                    </button>
                                </div>

                                <RecordsTable
                                    rows={sortRows(searchResults)}
                                    isAdmin={isAdmin}
                                    onEdit={openEditor}
                                    onDelete={openDeleteModal}
                                    sortField={sortField}
                                    sortDirection={sortDirection}
                                    onSort={handleSort}
                                />
                            </section>
                        )}

                        {/* MASTER RECORDS TABLE */}
                        <section className="panel">
                            <div className="section-heading-row">
                                <div>
                                    <span className="section-kicker">MASTER RECORD DIRECTORY</span>
                                    <h2>Inspection Log Archives</h2>
                                    <p className="section-subtitle">
                                        Showing latest <strong>{allRecords.length}</strong> records from the database. Click headers to sort.
                                    </p>
                                </div>
                                <div className="table-controls-right">
                                    <label className="limit-selector">
                                        <span>Show:</span>
                                        <select
                                            value={recordLimit}
                                            onChange={(e) => {
                                                const newLim = Number(e.target.value);
                                                setRecordLimit(newLim);
                                                loadAllRecords(newLim);
                                            }}
                                        >
                                            <option value={10}>10 records</option>
                                            <option value={25}>25 records</option>
                                            <option value={50}>50 records</option>
                                            <option value={100}>100 records</option>
                                        </select>
                                    </label>

                                    <button
                                        type="button"
                                        className="btn btn-secondary"
                                        onClick={() => loadAllRecords(recordLimit)}
                                        disabled={loadingAll}
                                        title="Reload records from server"
                                    >
                                        {loadingAll ? "Refreshing..." : "↻ Refresh Table"}
                                    </button>
                                </div>
                            </div>

                            {allMessage.text && (
                                <p className={`message message-${allMessage.type}`}>{allMessage.text}</p>
                            )}

                            {loadingAll && allRecords.length === 0 ? (
                                <div className="empty-state">
                                    <span className="empty-state-icon">⏳</span>
                                    <strong>Loading records...</strong>
                                    <span>Retrieving inspection dataset from server.</span>
                                </div>
                            ) : (
                                <RecordsTable
                                    rows={sortRows(allRecords)}
                                    isAdmin={isAdmin}
                                    onEdit={openEditor}
                                    onDelete={openDeleteModal}
                                    sortField={sortField}
                                    sortDirection={sortDirection}
                                    onSort={handleSort}
                                />
                            )}
                        </section>
                    </div>
                )}

                {/* =================================================
                    TAB 4: SHIFT ANALYTICS
                ================================================= */}
                {activeTab === "shifts" && (
                    <div className="tab-pane active-pane">
                        <section className="panel last-7-days-panel">
                            <div className="section-heading-row">
                                <div>
                                    <span className="section-kicker">OPERATIONAL SHIFT TRACKING</span>
                                    <h2>Last 7 Days Shift Breakdown</h2>
                                    <p className="section-subtitle">
                                        Shift A (06:00-14:00) · Shift B (14:00-22:00) · Shift C (22:00-06:00 Next Day)
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    className="btn btn-secondary summary-refresh-btn"
                                    onClick={loadLast7Days}
                                    disabled={loadingLast7Days}
                                >
                                    {loadingLast7Days ? "Refreshing..." : "↻ Refresh Shifts"}
                                </button>
                            </div>

                            {last7DaysMessage.text && (
                                <p className={`message message-${last7DaysMessage.type}`}>
                                    {last7DaysMessage.text}
                                </p>
                            )}

                            {loadingLast7Days && last7Days.length === 0 && (
                                <div className="empty-state">
                                    <span className="empty-state-icon">⏳</span>
                                    <strong>Loading shift metrics...</strong>
                                    <span>Calculating 7-day shift aggregation.</span>
                                </div>
                            )}

                            {!loadingLast7Days && last7Days.length === 0 && !last7DaysMessage.text && (
                                <div className="empty-state">
                                    <span className="empty-state-icon">📊</span>
                                    <strong>No shift summary data</strong>
                                    <span>Inspections recorded will appear grouped by shift date.</span>
                                </div>
                            )}

                            {last7Days.length > 0 && (
                                <div className="last-7-days-grid">
                                    {last7Days.map((day) => {
                                        const dTotal = Number(day.data_count || 0);
                                        return (
                                            <div className="day-summary-card shift-summary-card" key={day.record_date}>
                                                <div className="day-card-header">
                                                    <div className="day-summary-date">
                                                        {new Date(`${day.record_date}T00:00:00`).toLocaleDateString("en-GB", {
                                                            weekday: "short",
                                                            day: "2-digit",
                                                            month: "short",
                                                            year: "numeric"
                                                        })}
                                                    </div>
                                                    <div className="shift-summary-total">
                                                        <strong>{day.data_count}</strong> total
                                                    </div>
                                                </div>

                                                <div className="shift-breakdown-list">
                                                    <div className="shift-row shift-a">
                                                        <div className="shift-row-info">
                                                            <span className="shift-tag-dot tag-dot-a" />
                                                            <span className="shift-label">Shift A</span>
                                                            <small className="shift-timing">06:00-14:00</small>
                                                        </div>
                                                        <div className="shift-row-val">
                                                            <strong>{day.a_shift_count ?? 0}</strong>
                                                            <div className="shift-mini-bar">
                                                                <div
                                                                    className="mini-bar-fill fill-a"
                                                                    style={{ width: `${dTotal ? ((day.a_shift_count || 0) / dTotal) * 100 : 0}%` }}
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="shift-row shift-b">
                                                        <div className="shift-row-info">
                                                            <span className="shift-tag-dot tag-dot-b" />
                                                            <span className="shift-label">Shift B</span>
                                                            <small className="shift-timing">14:00-22:00</small>
                                                        </div>
                                                        <div className="shift-row-val">
                                                            <strong>{day.b_shift_count ?? 0}</strong>
                                                            <div className="shift-mini-bar">
                                                                <div
                                                                    className="mini-bar-fill fill-b"
                                                                    style={{ width: `${dTotal ? ((day.b_shift_count || 0) / dTotal) * 100 : 0}%` }}
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="shift-row shift-c">
                                                        <div className="shift-row-info">
                                                            <span className="shift-tag-dot tag-dot-c" />
                                                            <span className="shift-label">Shift C</span>
                                                            <small className="shift-timing">22:00-06:00</small>
                                                        </div>
                                                        <div className="shift-row-val">
                                                            <strong>{day.c_shift_count ?? 0}</strong>
                                                            <div className="shift-mini-bar">
                                                                <div
                                                                    className="mini-bar-fill fill-c"
                                                                    style={{ width: `${dTotal ? ((day.c_shift_count || 0) / dTotal) * 100 : 0}%` }}
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* CUSTOM DATE LOOKUP */}
                            <div className="date-summary-search">
                                <div className="date-summary-header">
                                    <span className="section-kicker">HISTORICAL INQUIRY</span>
                                    <h3>Look Up Shift Total for Any Date</h3>
                                    <p>Select any past calendar date to view shift distributions.</p>
                                </div>

                                <div className="date-summary-controls">
                                    <label className="date-picker-label">
                                        <span>Select Date</span>
                                        <input
                                            type="date"
                                            value={selectedSummaryDate}
                                            onChange={(e) => setSelectedSummaryDate(e.target.value)}
                                        />
                                    </label>
                                    <button
                                        type="button"
                                        className="btn btn-primary"
                                        onClick={loadDateSummary}
                                        disabled={!selectedSummaryDate || dateSummaryLoading}
                                    >
                                        {dateSummaryLoading ? "Querying..." : "View Shift Totals"}
                                    </button>
                                </div>

                                {dateSummaryMessage.text && (
                                    <p className={`message message-${dateSummaryMessage.type}`}>{dateSummaryMessage.text}</p>
                                )}

                                {dateSummary && (
                                    <div className="date-summary-result-card">
                                        <div className="summary-stat-box stat-grand-total">
                                            <span>Total Day Records</span>
                                            <strong>{dateSummary.data_count ?? 0}</strong>
                                        </div>
                                        <div className="summary-stat-box stat-shift-a">
                                            <span>A Shift (06:00-14:00)</span>
                                            <strong>{dateSummary.a_shift_count ?? 0}</strong>
                                        </div>
                                        <div className="summary-stat-box stat-shift-b">
                                            <span>B Shift (14:00-22:00)</span>
                                            <strong>{dateSummary.b_shift_count ?? 0}</strong>
                                        </div>
                                        <div className="summary-stat-box stat-shift-c">
                                            <span>C Shift (22:00-06:00)</span>
                                            <strong>{dateSummary.c_shift_count ?? 0}</strong>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </section>
                    </div>
                )}

                {/* =================================================
                    TAB 5: USER MANAGEMENT (SUPER ADMIN)
                ================================================= */}
                {activeTab === "users" && isSuperAdmin && (
                    <div className="tab-pane active-pane">
                        <UserManagement />
                    </div>
                )}

                {/* =================================================
                    MODAL: EDIT SAVED RECORD
                ================================================= */}
                {editingRecord && isAdmin && (
                    <div className="record-modal-backdrop" onClick={() => !editSaving && setEditingRecord(null)}>
                        <div className="record-modal" onClick={(e) => e.stopPropagation()}>
                            <div className="record-modal-header">
                                <div>
                                    <span className="section-kicker">ADMIN PRIVILEGE</span>
                                    <h2>Edit Inspection Record</h2>
                                    <p>Update inspection metadata or ultrasonic reading points.</p>
                                </div>
                                <button
                                    type="button"
                                    className="modal-close"
                                    onClick={() => !editSaving && setEditingRecord(null)}
                                >
                                    ×
                                </button>
                            </div>

                            <form onSubmit={handleUpdateRecord}>
                                <div className="edit-grid">
                                    {COLUMNS.map((col) => (
                                        <label key={col.key} className="edit-field">
                                            <span>{col.label}</span>
                                            <input
                                                type={
                                                    col.key === "record_date"
                                                        ? "date"
                                                        : col.key === "record_time"
                                                        ? "time"
                                                        : col.inputType || "text"
                                                }
                                                value={editingRecord[col.key] ?? ""}
                                                onChange={(e) =>
                                                    setEditingRecord((prev) => ({ ...prev, [col.key]: e.target.value }))
                                                }
                                                required={
                                                    col.key === "heading" ||
                                                    col.key === "customer_name" ||
                                                    col.key === "uid" ||
                                                    col.key === "record_date" ||
                                                    col.key === "record_time"
                                                }
                                            />
                                        </label>
                                    ))}
                                </div>

                                {editMessage.text && (
                                    <p className={`message message-${editMessage.type}`}>{editMessage.text}</p>
                                )}

                                <div className="record-modal-actions">
                                    <button
                                        type="button"
                                        className="btn btn-secondary"
                                        onClick={() => setEditingRecord(null)}
                                        disabled={editSaving}
                                    >
                                        Cancel
                                    </button>
                                    <button type="submit" className="btn btn-primary" disabled={editSaving}>
                                        {editSaving ? "Saving Changes..." : "Save Changes"}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* =================================================
                    MODAL: DELETE RECORD CONFIRMATION
                ================================================= */}
                {deleteModalRecord && isAdmin && (
                    <div className="record-modal-backdrop" onClick={() => !deleteSubmitting && setDeleteModalRecord(null)}>
                        <div className="record-modal um-modal" onClick={(e) => e.stopPropagation()}>
                            <div className="record-modal-header">
                                <div>
                                    <span className="section-kicker section-kicker-danger">DESTRUCTIVE ACTION</span>
                                    <h2>Delete Inspection Record</h2>
                                    <p>Are you sure you want to permanently delete this inspection record?</p>
                                </div>
                                <button
                                    type="button"
                                    className="modal-close"
                                    onClick={() => !deleteSubmitting && setDeleteModalRecord(null)}
                                >
                                    ×
                                </button>
                            </div>

                            <div className="modal-warning-body">
                                <div className="delete-record-card-summary">
                                    <div><span>Customer:</span> <strong>{deleteModalRecord.customer_name}</strong></div>
                                    <div><span>Heading:</span> <strong>{deleteModalRecord.heading}</strong></div>
                                    <div><span>UID:</span> <strong>{deleteModalRecord.uid}</strong></div>
                                    <div><span>Date:</span> <strong>{formatDisplayDate(deleteModalRecord.record_date)}</strong></div>
                                </div>
                                <p>
                                    This operation will permanently remove this testing record from the database. This action cannot be reversed.
                                </p>
                            </div>

                            <div className="record-modal-actions">
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => setDeleteModalRecord(null)}
                                    disabled={deleteSubmitting}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-danger"
                                    onClick={handleDeleteConfirm}
                                    disabled={deleteSubmitting}
                                >
                                    {deleteSubmitting ? "Deleting..." : "Permanently Delete"}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </main>

            <footer className="app-footer">
                <div className="footer-content">
                    <span>LEGION System · Ultrasonic Testing Operations · Protected Workplace</span>
                    <span className="footer-version">v2.4 Enterprise Edition</span>
                </div>
            </footer>
        </div>
    );
}

function App() {
    const { user, loading } = useAuth();

    if (loading) {
        return (
            <div className="login-page">
                <div className="login-card session-check-card">
                    <p className="login-eyebrow">LEGION SYSTEM</p>
                    <h1>Preparing workspace</h1>
                    <p>Verifying secure session credentials…</p>
                </div>
            </div>
        );
    }

    return user ? <MainApp /> : <Login />;
}

export default App;
