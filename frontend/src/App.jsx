import { useEffect, useState } from "react";
import { useAuth } from "./AuthContext.jsx";
import Login from "./Login.jsx";
import UserManagement from "./UserManagement.jsx";
import { SubscriptionBanner, SubscriptionChip } from "./SubscriptionStatus.jsx";

import {
    createRecord,
    getAllRecords,
    searchRecords,
    updateRecord,
    deleteRecord,
    getLast7DaysSummary,
    getDateSummary,
    getErrorMessage,
} from "./api.js";

import "./App.css";


/* =========================================================
   TABLE COLUMNS
========================================================= */

const COLUMNS = [
    { key: "heading", label: "heading" },
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
    "loc1",
    "loc2",
    "loc3",
    "loc4",
    "loc5",
    "loc6",
    "loc7",
    "loc8",
    "loc9",
    "loc10",
    "loc11",
    "loc12",
];


/* =========================================================
   CURRENT DATE
========================================================= */

function getCurrentDate() {

    const today = new Date();

    const year = today.getFullYear();

    const month = String(
        today.getMonth() + 1
    ).padStart(2, "0");

    const day = String(
        today.getDate()
    ).padStart(2, "0");

    return `${year}-${month}-${day}`;
}


/* =========================================================
   CURRENT TIME
========================================================= */

function getCurrentTime() {

    const now = new Date();

    const hours = String(
        now.getHours()
    ).padStart(2, "0");

    const minutes = String(
        now.getMinutes()
    ).padStart(2, "0");

    const seconds = String(
        now.getSeconds()
    ).padStart(2, "0");

    return `${hours}:${minutes}:${seconds}`;
}


/*
   HTML time input normally displays HH:MM.
   PostgreSQL accepts HH:MM:SS.
*/

function formatTimeForApi(value) {

    if (!value) {
        return "";
    }

    if (value.length === 5) {
        return `${value}:00`;
    }

    return value;
}


/* =========================================================
   EMPTY FORM
========================================================= */

function emptyForm(
    heading = "",
    customerName = ""
) {

    return {

        heading,

        customer_name: customerName,

        uid: "",

        record_date: getCurrentDate(),

        record_time: getCurrentTime(),

        loc1: "",
        loc2: "",
        loc3: "",
        loc4: "",
        loc5: "",
        loc6: "",
        loc7: "",
        loc8: "",
        loc9: "",
        loc10: "",
        loc11: "",
        loc12: "",
    };
}


/* =========================================================
   UNIQUE DROPDOWN VALUES
========================================================= */

function uniqueValues(records, key) {

    return [
        ...new Set(
            records
                .map((row) =>
                    (row[key] ?? "")
                        .toString()
                        .trim()
                )
                .filter(Boolean)
        ),
    ].sort((a, b) =>
        a.localeCompare(b)
    );
}


/* =========================================================
   DISPLAY DATE
========================================================= */

function formatDisplayDate(value) {

    if (!value) {
        return "";
    }

    const str = String(value);

    const datePart = str.includes("T")
        ? str.split("T")[0]
        : str.slice(0, 10);

    const [year, month, day] =
        datePart.split("-");

    if (year && month && day) {
        return `${day}-${month}-${year}`;
    }

    return datePart;
}


/* =========================================================
   DISPLAY TIME
========================================================= */

function formatDisplayTime(value) {

    if (!value) {
        return "";
    }

    return String(value).slice(0, 5);
}


/* =========================================================
   DISPLAY TABLE CELL
========================================================= */

function displayCell(record, key) {

    const value = record[key];

    if (key === "record_date") {
        return formatDisplayDate(value);
    }

    if (key === "record_time") {
        return formatDisplayTime(value);
    }

    return value ?? "";
}


/* =========================================================
   UNIQUE ROW KEY
========================================================= */

function recordKey(row) {

    return `${row.heading}|${row.customer_name}|${row.uid}`;
}


/* =========================================================
   TABLE COMPONENT
========================================================= */

function RecordsTable({ rows, isAdmin = false, onEdit, onDelete }) {

    if (!rows.length) {
        return null;
    }

    return (

        <div className="table-scroll">

            <table className="data-table">

                <thead>

                    <tr>

                        {COLUMNS.map((col) => (

                            <th key={col.key}>
                                {col.label}
                            </th>

                        ))}

                        {isAdmin && <th className="record-actions-heading">Actions</th>}

                    </tr>

                </thead>

                <tbody>

                    {rows.map((row) => (

                        <tr
                            key={recordKey(row)}
                        >

                            {COLUMNS.map((col) => (

                                <td key={col.key}>

                                    {displayCell(
                                        row,
                                        col.key
                                    )}

                                </td>

                            ))}

                            {isAdmin && (
                                <td className="record-actions-cell">
                                    <button type="button" className="btn btn-secondary small-btn" onClick={() => onEdit(row)}>Edit</button>
                                    <button type="button" className="btn btn-danger small-btn" onClick={() => onDelete(row)}>Delete</button>
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
   MAIN APP
========================================================= */

function MainApp() {

    const { user, logout } = useAuth();
    const isAdmin = user?.role === "admin";

    /* -----------------------------------------------------
       ADMIN RECORD EDITING
    ----------------------------------------------------- */

    const [editingRecord, setEditingRecord] = useState(null);
    const [editSaving, setEditSaving] = useState(false);
    const [editMessage, setEditMessage] = useState({ type: "", text: "" });

    /* -----------------------------------------------------
       ADD RECORD
    ----------------------------------------------------- */

    const [form, setForm] = useState(
        () => emptyForm()
    );

    const [saveMessage, setSaveMessage] =
        useState({
            type: "",
            text: "",
        });

    const [saving, setSaving] =
        useState(false);


    /* -----------------------------------------------------
       SEARCH
    ----------------------------------------------------- */

    const [searchHeading, setSearchHeading] =
        useState("");

    const [searchCustomer, setSearchCustomer] =
        useState("");

    const [searchUid, setSearchUid] =
        useState("");

    const [searchDate, setSearchDate] =
        useState("");

    const [searchResults, setSearchResults] =
        useState([]);

    const [searchMessage, setSearchMessage] =
        useState({
            type: "",
            text: "",
        });

    const [searching, setSearching] =
        useState(false);


    /* -----------------------------------------------------
       ALL RECORDS
    ----------------------------------------------------- */

    const [allRecords, setAllRecords] =
        useState([]);

    const [allMessage, setAllMessage] =
        useState({
            type: "",
            text: "",
        });

    const [loadingAll, setLoadingAll] =
        useState(false);

    /* -----------------------------------------------------
       LAST 7 DAYS SUMMARY
    ----------------------------------------------------- */

    const [last7Days, setLast7Days] = useState([]);
    const [loadingLast7Days, setLoadingLast7Days] = useState(false);
    const [last7DaysMessage, setLast7DaysMessage] = useState({
        type: "",
        text: "",
    });

    /* -----------------------------------------------------
       DATE-WISE SUMMARY
    ----------------------------------------------------- */

    const [selectedSummaryDate, setSelectedSummaryDate] = useState(() => {
        const now = new Date();
        const hour = now.getHours();
        const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        if (hour < 6) base.setDate(base.getDate() - 1);
        return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(base.getDate()).padStart(2, "0")}`;
    });

    const [dateSummary, setDateSummary] = useState(null);
    const [dateSummaryLoading, setDateSummaryLoading] = useState(false);


    /* -----------------------------------------------------
       DROPDOWN OPTIONS
    ----------------------------------------------------- */

    const headingOptions =
        uniqueValues(
            allRecords,
            "heading"
        );

    const customerOptions =
        uniqueValues(
            allRecords,
            "customer_name"
        );


    /* =====================================================
       UPDATE RECORD LIST
    ===================================================== */

    const applyRecords = (data) => {

        // The dashboard intentionally shows only the 10 most recent records.
        const latestTen = Array.isArray(data) ? data.slice(0, 10) : [];
        setAllRecords(latestTen);

        if (data.length === 0) {

            setAllMessage({
                type: "info",
                text: "No records found.",
            });

        } else {

            setAllMessage({
                type: "",
                text: "",
            });
        }
    };


    /* =====================================================
       LOAD ALL RECORDS
    ===================================================== */

    const loadLast7Days = async () => {
        setLoadingLast7Days(true);
        setLast7DaysMessage({ type: "", text: "" });

        try {
            const data = await getLast7DaysSummary();
            setLast7Days(Array.isArray(data) ? data : []);
        } catch (error) {
            setLast7Days([]);
            setLast7DaysMessage({
                type: "error",
                text: getErrorMessage(error, "Failed to load 7-day summary."),
            });
        } finally {
            setLoadingLast7Days(false);
        }
    };


    const loadDateSummary = async () => {
        if (!selectedSummaryDate) return;
        setDateSummaryLoading(true);
        try {
            const data = await getDateSummary(selectedSummaryDate);
            setDateSummary(data);
        } catch (error) {
            setDateSummary(null);
            setLast7DaysMessage({ type: "error", text: getErrorMessage(error, "Failed to load date summary.") });
        } finally {
            setDateSummaryLoading(false);
        }
    };


    const loadAllRecords = async () => {

        setLoadingAll(true);

        setAllMessage({
            type: "",
            text: "",
        });

        try {

            const data =
                await getAllRecords();

            applyRecords(data);
            await loadLast7Days();

        } catch (error) {

            setAllRecords([]);

            setAllMessage({
                type: "error",
                text: getErrorMessage(
                    error,
                    "Failed to load records."
                ),
            });

        } finally {

            setLoadingAll(false);
        }
    };


    /* =====================================================
       INITIAL LOAD
    ===================================================== */

    useEffect(() => {

        loadAllRecords();
        loadLast7Days();

        // Keep the dashboard summary current while the page is open.
        const summaryInterval = setInterval(() => {
            loadLast7Days();
        }, 10000);

        return () => clearInterval(summaryInterval);

    }, []);


    /* =====================================================
       LIVE DATE + TIME
       
       Update every second so the displayed time
       always represents the current system time.
    ===================================================== */

    useEffect(() => {

        const interval = setInterval(() => {

            setForm((prev) => ({
                ...prev,
                record_date: getCurrentDate(),
                record_time: getCurrentTime(),
            }));

        }, 1000);


        return () => {
            clearInterval(interval);
        };

    }, []);


    /* =====================================================
       FORM CHANGE
    ===================================================== */

    const handleFormChange = (
        key,
        value
    ) => {

        setForm((prev) => ({
            ...prev,
            [key]: value,
        }));

        setSaveMessage({
            type: "",
            text: "",
        });
    };


    /* =====================================================
       SAVE RECORD
    ===================================================== */

    const handleSave = async () => {

        const heading =
            form.heading.trim();

        const customerName =
            form.customer_name.trim();

        const uid =
            form.uid.trim();

        /*
           Always take the CURRENT system
           date and time when saving.
        */

        const recordDate =
            getCurrentDate();

        const recordTime =
            formatTimeForApi(
                getCurrentTime()
            );


        if (
            !heading ||
            !customerName ||
            !uid
        ) {

            setSaveMessage({
                type: "error",
                text:
                    "Heading, Customer Name and UID are required.",
            });

            return;
        }


        setSaving(true);

        setSaveMessage({
            type: "",
            text: "",
        });


        try {

            const payload = {

                heading,

                customer_name:
                    customerName,

                uid,

                record_date:
                    recordDate,

                record_time:
                    recordTime,
            };


            LOC_KEYS.forEach((key) => {

                payload[key] =
                    (
                        form[key] ?? ""
                    ).trim();

            });


            const createResponse = await createRecord(payload);

            // Confirm the database can immediately return the exact record that
            // the API just reported as inserted. This prevents a false
            // "Record saved successfully" message when the save did not
            // actually reach the database used by the app.
            const verificationRows = await searchRecords({
                heading,
                customer_name: customerName,
                uid,
                record_date: recordDate,
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
                throw new Error(
                    "The record could not be verified in the database. It was not marked as saved."
                );
            }

            setSaveMessage({
                type: "success",
                text: "Record saved successfully and verified in the database.",
            });


            /*
               Keep Heading and Customer Name
               so user can quickly enter another
               record for the same part/customer.
            */

            setForm(
                emptyForm(
                    heading,
                    customerName
                )
            );


            /*
               Refresh records so new Heading
               and Customer values immediately
               become available in dropdowns.
            */

            const data =
                await getAllRecords();

            applyRecords(data);

            // Refresh the 7-day summary immediately after a new record is saved.
            await loadLast7Days();


        } catch (error) {

            if (
                error.response?.status === 409
            ) {

                setSaveMessage({
                    type: "error",
                    text:
                        "Record already exists for this Heading, Customer Name and UID combination.",
                });

            } else {

                setSaveMessage({
                    type: "error",
                    text: getErrorMessage(
                        error,
                        "Failed to save record."
                    ),
                });
            }

        } finally {

            setSaving(false);
        }
    };


    const startEditRecord = (row) => {
        if (!isAdmin) return;
        setEditingRecord({ ...row });
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
                record_date: editingRecord.record_date,
                record_time: editingRecord.record_time,
                ...Object.fromEntries(LOC_KEYS.map((key) => [key, editingRecord[key] ?? ""]))
            });

            setEditingRecord(null);
            setEditMessage({ type: "success", text: "Record updated successfully." });
            await loadAllRecords();
            await loadLast7Days();
        } catch (error) {
            setEditMessage({ type: "error", text: getErrorMessage(error, "Failed to update record.") });
        } finally {
            setEditSaving(false);
        }
    };

    const handleDeleteRecord = async (row) => {
        if (!isAdmin) return;
        const confirmed = window.confirm(`Delete record for ${row.customer_name} / ${row.uid}? This cannot be undone.`);
        if (!confirmed) return;

        try {
            await deleteRecord({
                heading: row.heading,
                customer_name: row.customer_name,
                uid: row.uid
            });
            setAllMessage({ type: "success", text: "Record deleted successfully." });
            await loadAllRecords();
            await loadLast7Days();
        } catch (error) {
            setAllMessage({ type: "error", text: getErrorMessage(error, "Failed to delete record.") });
        }
    };

    const openEditor = (row) => {
        setEditingRecord({
            ...row,
            _original_heading: row.heading,
            _original_customer_name: row.customer_name,
            _original_uid: row.uid,
            record_time: row.record_time ? String(row.record_time).slice(0, 5) : ""
        });
        setEditMessage({ type: "", text: "" });
    };

    /* =====================================================
       FLEXIBLE SEARCH
    ===================================================== */

    const handleSearch = async (e) => {

        e.preventDefault();


        const heading =
            searchHeading.trim();

        const customerName =
            searchCustomer.trim();

        const uid =
            searchUid.trim();


        /*
           At least ONE field must be entered.
        */

        if (
            !heading &&
            !customerName &&
            !uid &&
            !searchDate
        ) {

            setSearchMessage({
                type: "error",
                text:
                    "Please enter at least one search field.",
            });

            setSearchResults([]);

            return;
        }


        setSearching(true);

        setSearchMessage({
            type: "",
            text: "",
        });

        setSearchResults([]);


        try {

            const data =
                await searchRecords({

                    heading,

                    customer_name:
                        customerName,

                    uid,

                    record_date:
                        searchDate,
                });


            setSearchResults(data);


            if (data.length === 0) {

                setSearchMessage({
                    type: "info",
                    text:
                        "No matching records found.",
                });
            }


        } catch (error) {

            setSearchResults([]);

            setSearchMessage({
                type: "error",
                text: getErrorMessage(
                    error,
                    "Search failed."
                ),
            });

        } finally {

            setSearching(false);
        }
    };


    /* =====================================================
       CLEAR SEARCH
    ===================================================== */

    const handleClearSearch = () => {

        setSearchHeading("");

        setSearchCustomer("");

        setSearchUid("");

        setSearchDate("");

        setSearchResults([]);

        setSearchMessage({
            type: "",
            text: "",
        });
    };


    /* =====================================================
       SHOW ALL
    ===================================================== */

    const handleShowAll = async () => {

        await loadAllRecords();
    };


    /* =====================================================
       RENDER
    ===================================================== */

    return (

        <div className="app">


            {/* =================================================
                COMPANY HEADER
            ================================================= */}

            <header className="company-header">

                <div className="header-row">
                    <h1>
                        <span>
                            Legion Insulator Ultrasonic Testing
                            <span className="header-title-sub">Inspection data · made by Aman</span>
                        </span>
                    </h1>
                    <div className="header-user">
                        {!isAdmin && <SubscriptionChip subscription={user?.subscription} />}
                        <span className="header-user-name">Logged in: <strong>{user?.username}</strong></span>
                        {isAdmin && <span className="role-badge">ADMIN</span>}
                        <button type="button" className="btn btn-light" onClick={logout}>Logout</button>
                    </div>
                </div>

            </header>

            {!isAdmin && <SubscriptionBanner subscription={user?.subscription} />}

            <section className="dashboard-hero content">
                <div className="dashboard-hero-copy">
                    <span className="hero-overline">LEGION OPERATIONS</span>
                    <h2>Inspection Control Center</h2>
                    <p>Capture, search and review ultrasonic testing records from one secure workspace.</p>
                </div>
                <div className="hero-status-stack">
                    <div className="hero-status-pill"><span className="status-pulse"></span> System online</div>
                    <div className="hero-role-card">
                        <span className="hero-role-label">ACCESS LEVEL</span>
                        <strong>{isAdmin ? "Administrator" : "Operator"}</strong>
                    </div>
                </div>
            </section>

            {/* =================================================
                DROPDOWNS
            ================================================= */}

            <datalist id="heading-options">

                {headingOptions.map(
                    (option) => (

                        <option
                            key={option}
                            value={option}
                        />

                    )
                )}

            </datalist>


            <datalist id="customer-options">

                {customerOptions.map(
                    (option) => (

                        <option
                            key={option}
                            value={option}
                        />

                    )
                )}

            </datalist>


            {isAdmin && <div className="content"><UserManagement /></div>}

            <main className="content">


                {/* =================================================
                    ADD RECORD
                ================================================= */}

                <section className="panel">

                    <h2>
                        Add New Record
                    </h2>


                    <div className="record-form">

                        <div>
                            <p className="form-group-title">Record details</p>
                            <div className="field-grid field-grid-main">
                                <label className="field">
                                    <span>Heading</span>
                                    <input
                                        type="text"
                                        list="heading-options"
                                        value={form.heading}
                                        onChange={(e) => handleFormChange("heading", e.target.value)}
                                        placeholder="Select or type heading"
                                    />
                                </label>
                                <label className="field">
                                    <span>Customer Name</span>
                                    <input
                                        type="text"
                                        list="customer-options"
                                        value={form.customer_name}
                                        onChange={(e) => handleFormChange("customer_name", e.target.value)}
                                        placeholder="Select or type customer"
                                    />
                                </label>
                                <label className="field">
                                    <span>UID</span>
                                    <input
                                        type="text"
                                        value={form.uid}
                                        onChange={(e) => handleFormChange("uid", e.target.value)}
                                        placeholder="UID"
                                    />
                                </label>
                                <label className="field">
                                    <span>Date (auto)</span>
                                    <input type="date" value={form.record_date} readOnly className="readonly-input" />
                                </label>
                                <label className="field">
                                    <span>Time (auto)</span>
                                    <input type="time" value={form.record_time.slice(0, 5)} readOnly className="readonly-input" />
                                </label>
                            </div>
                        </div>

                        <div>
                            <p className="form-group-title">Readings</p>
                            <div className="field-grid field-grid-loc">
                                {COLUMNS.filter((col) => LOC_KEYS.includes(col.key)).map((col) => (
                                    <label className="field" key={col.key}>
                                        <span>{col.label}</span>
                                        <input
                                            type="number"
                                            inputMode="decimal"
                                            value={form[col.key] ?? ""}
                                            onChange={(e) => handleFormChange(col.key, e.target.value)}
                                            placeholder="0"
                                        />
                                    </label>
                                ))}
                            </div>
                        </div>

                    </div>


                    <div className="actions">

                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={
                                handleSave
                            }
                            disabled={saving}
                        >

                            {saving
                                ? "Saving..."
                                : "Save Record"}

                        </button>

                    </div>


                    {saveMessage.text && (

                        <p
                            className={`message message-${saveMessage.type}`}
                        >
                            {saveMessage.text}
                        </p>

                    )}

                </section>


                {/* =================================================
                    FLEXIBLE SEARCH
                ================================================= */}

                <section className="panel">

                    <h2>
                        Search Records
                    </h2>


                    <p className="search-help">
                        Enter any one or combination
                        of Heading, Customer Name, UID or
                        Date.
                    </p>


                    <form
                        className="search-grid"
                        onSubmit={handleSearch}
                    >


                        {/* HEADING */}

                        <div className="search-field">
                            <label htmlFor="search-heading">Heading</label>
<input
                            id="search-heading"
                            type="text"
                            list="heading-options"
                            value={
                                searchHeading
                            }
                            onChange={
                                (e) =>
                                    setSearchHeading(
                                        e.target.value
                                    )
                            }
                            placeholder="Select or type heading"
                        />
                        </div>


                        {/* CUSTOMER */}

                        <div className="search-field">
                            <label htmlFor="search-customer">Customer Name</label>
<input
                            id="search-customer"
                            type="text"
                            list="customer-options"
                            value={
                                searchCustomer
                            }
                            onChange={
                                (e) =>
                                    setSearchCustomer(
                                        e.target.value
                                    )
                            }
                            placeholder="Select or type customer"
                        />
                        </div>


                        {/* UID */}

                        <div className="search-field">
                            <label htmlFor="search-uid">UID</label>
<input
                            id="search-uid"
                            type="text"
                            value={
                                searchUid
                            }
                            onChange={
                                (e) =>
                                    setSearchUid(
                                        e.target.value
                                    )
                            }
                            placeholder="Enter UID"
                        />
                        </div>


                        {/* DATE */}

                        <div className="search-field">
                            <label htmlFor="search-date">Date</label>
<input
                            id="search-date"
                            type="date"
                            value={searchDate}
                            onChange={(e) =>
                                setSearchDate(e.target.value)
                            }
                        />
                        </div>

                        {/* BUTTONS */}

                        <div className="search-buttons">

                            <button
                                type="submit"
                                className="btn btn-secondary"
                                disabled={
                                    searching
                                }
                            >

                                {searching
                                    ? "Searching..."
                                    : "Search"}

                            </button>


                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={
                                    handleClearSearch
                                }
                            >
                                Clear
                            </button>

                        </div>

                    </form>


                    {searchMessage.text && (

                        <p
                            className={`message message-${searchMessage.type}`}
                        >
                            {searchMessage.text}
                        </p>

                    )}


                    {/* SEARCH RESULTS */}

                    {searchResults.length > 0 && (

                        <div className="result-block">

                            <h3>
                                Search Results
                                ({searchResults.length})
                            </h3>

                            <RecordsTable
                                rows={searchResults}
                                isAdmin={isAdmin}
                                onEdit={openEditor}
                                onDelete={handleDeleteRecord}
                            />

                        </div>

                    )}

                </section>


                {/* =================================================
                    ALL RECORDS
                ================================================= */}

                <section className="panel">

                    <div className="section-heading-row">
                        <div>
                            <span className="section-kicker">RECENT ACTIVITY</span>
                            <h2>Latest 10 Records</h2>
                            <p className="section-subtitle">Showing the 10 most recent inspection records.</p>
                        </div>
                        <div className="record-count-badge">{allRecords.length} / 10</div>
                    </div>


                    <div className="actions top-actions">

                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={
                                handleShowAll
                            }
                            disabled={
                                loadingAll
                            }
                        >

                            {loadingAll
                                ? "Loading records..."
                                : "Refresh Latest 10"}

                        </button>

                    </div>


                    {allMessage.text && (

                        <p
                            className={`message message-${allMessage.type}`}
                        >
                            {allMessage.text}
                        </p>

                    )}


                    {allRecords.length > 0 && (

                        <RecordsTable
                            rows={allRecords}
                            isAdmin={isAdmin}
                            onEdit={openEditor}
                            onDelete={handleDeleteRecord}
                        />

                    )}

                </section>

                {/* =================================================
                    LAST 7 DAYS DATA ENTRY SUMMARY
                ================================================= */}

                <section className="panel last-7-days-panel">
                    <div className="section-heading-row">
                        <div>
                            <span className="section-kicker">DATA ENTRY SUMMARY</span>
                            <h2>Last 7 Days - Shift Wise</h2>
                        </div>
                        <button
                            type="button"
                            className="btn btn-secondary summary-refresh-btn"
                            onClick={loadLast7Days}
                            disabled={loadingLast7Days}
                        >
                            {loadingLast7Days ? "Loading..." : "Refresh Summary"}
                        </button>
                    </div>

                    {last7DaysMessage.text && (
                        <p className={`message message-${last7DaysMessage.type}`}>
                            {last7DaysMessage.text}
                        </p>
                    )}

                    {last7Days.length > 0 && (
                        <div className="last-7-days-grid">
                            {last7Days.map((day) => (
                                <div className="day-summary-card shift-summary-card" key={day.record_date}>
                                    <div className="day-summary-date">
                                        {new Date(`${day.record_date}T00:00:00`).toLocaleDateString("en-GB", {
                                            day: "2-digit",
                                            month: "2-digit",
                                            year: "numeric",
                                        })}
                                    </div>

                                    <div className="shift-summary-total">
                                        <strong>{day.data_count}</strong> total
                                    </div>

                                    <div className="shift-row shift-a">
                                        <span>A Shift</span>
                                        <strong>{day.a_shift_count ?? 0}</strong>
                                        <small>06:00-14:00</small>
                                    </div>

                                    <div className="shift-row shift-b">
                                        <span>B Shift</span>
                                        <strong>{day.b_shift_count ?? 0}</strong>
                                        <small>14:00-22:00</small>
                                    </div>

                                    <div className="shift-row shift-c">
                                        <span>C Shift</span>
                                        <strong>{day.c_shift_count ?? 0}</strong>
                                        <small>22:00-06:00</small>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="date-summary-search">
                        <div>
                            <span className="section-kicker">DATE-WISE TOTAL</span>
                            <h3>Search Total Data for a Date</h3>
                        </div>
                        <div className="date-summary-controls">
                            <label>
                                <span>Date</span>
                                <input type="date" value={selectedSummaryDate} onChange={(e) => setSelectedSummaryDate(e.target.value)} />
                            </label>
                            <button type="button" className="btn btn-primary" onClick={loadDateSummary} disabled={!selectedSummaryDate || dateSummaryLoading}>
                                {dateSummaryLoading ? "Loading..." : "View Total"}
                            </button>
                        </div>
                        {dateSummary && (
                            <div className="date-summary-result">
                                <div><span>Total Data</span><strong>{dateSummary.data_count ?? 0}</strong></div>
                                <div><span>A Shift</span><strong>{dateSummary.a_shift_count ?? 0}</strong></div>
                                <div><span>B Shift</span><strong>{dateSummary.b_shift_count ?? 0}</strong></div>
                                <div><span>C Shift</span><strong>{dateSummary.c_shift_count ?? 0}</strong></div>
                            </div>
                        )}
                    </div>
                </section>

                {editingRecord && isAdmin && (
                    <div className="record-modal-backdrop" onClick={() => !editSaving && setEditingRecord(null)}>
                        <div className="record-modal" onClick={(e) => e.stopPropagation()}>
                            <div className="record-modal-header">
                                <div>
                                    <span className="section-kicker">ADMIN CONTROL</span>
                                    <h2>Edit Saved Record</h2>
                                    <p>Update the record and save your changes to the database.</p>
                                </div>
                                <button type="button" className="modal-close" onClick={() => !editSaving && setEditingRecord(null)}>×</button>
                            </div>

                            <form onSubmit={handleUpdateRecord}>
                                <div className="edit-grid">
                                    {COLUMNS.map((col) => (
                                        <label key={col.key} className="edit-field">
                                            <span>{col.label}</span>
                                            <input
                                                type={col.key === "record_date" ? "date" : col.key === "record_time" ? "time" : col.inputType || "text"}
                                                value={editingRecord[col.key] ?? ""}
                                                onChange={(e) => setEditingRecord(prev => ({ ...prev, [col.key]: e.target.value }))}
                                                required={col.key === "heading" || col.key === "customer_name" || col.key === "uid" || col.key === "record_date" || col.key === "record_time"}
                                            />
                                        </label>
                                    ))}
                                </div>

                                {editMessage.text && <p className={`message message-${editMessage.type}`}>{editMessage.text}</p>}

                                <div className="record-modal-actions">
                                    <button type="button" className="btn btn-secondary" onClick={() => setEditingRecord(null)} disabled={editSaving}>Cancel</button>
                                    <button type="submit" className="btn btn-primary" disabled={editSaving}>{editSaving ? "Saving Changes..." : "Save Changes"}</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

            </main>

        </div>
    );
}

function App() {
    const { user, loading } = useAuth();

    if (loading) {
        return <div className="login-page"><div className="login-card"><h1>Legion</h1><p>Checking login...</p></div></div>;
    }

    return user ? <MainApp /> : <Login />;
}

export default App;
