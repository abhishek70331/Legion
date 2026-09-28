import { useEffect, useState } from "react";

import {
    createRecord,
    getAllRecords,
    searchRecords,
    getErrorMessage,
} from "./api.js";

import "./App.css";


/* =========================================================
   TABLE COLUMNS
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

function RecordsTable({ rows }) {

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

export default function App() {

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
       DROPDOWN OPTIONS
    ----------------------------------------------------- */

    const headingOptions =
        uniqueValues(
            allRecords,
            "Heading"
        );

    const customerOptions =
        uniqueValues(
            allRecords,
            "Customer_name"
        );


    /* =====================================================
       UPDATE RECORD LIST
    ===================================================== */

    const applyRecords = (data) => {

        setAllRecords(data);

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


            await createRecord(
                payload
            );


            setSaveMessage({
                type: "success",
                text:
                    "Record saved successfully.",
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
            !uid
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

                <h1>
                   
                Legion Insulator Ultrasonic Testing Data (made by Aman)
                </h1>

            </header>


            {/* =================================================get
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


            <main className="content">


                {/* =================================================
                    ADD RECORD
                ================================================= */}

                <section className="panel">

                    <h2>
                        Add New Record
                    </h2>


                    <div className="table-scroll">

                        <table className="data-table input-table">

                            <thead>

                                <tr>

                                    {COLUMNS.map(
                                        (col) => (

                                            <th
                                                key={col.key}
                                            >
                                                {col.label}
                                            </th>

                                        )
                                    )}

                                </tr>

                            </thead>


                            <tbody>

                                <tr>

                                    {COLUMNS.map(
                                        (col) => (

                                            <td
                                                key={col.key}
                                            >

                                                {/* HEADING */}

                                                {col.key ===
                                                "heading" ? (

                                                    <input
                                                        type="text"
                                                        list="heading-options"
                                                        value={
                                                            form.heading
                                                        }
                                                        onChange={
                                                            (e) =>
                                                                handleFormChange(
                                                                    "heading",
                                                                    e.target.value
                                                                )
                                                        }
                                                        placeholder="Select or type heading"
                                                    />


                                                ) : col.key ===
                                                "customer_name" ? (


                                                    /* CUSTOMER */

                                                    <input
                                                        type="text"
                                                        list="customer-options"
                                                        value={
                                                            form.customer_name
                                                        }
                                                        onChange={
                                                            (e) =>
                                                                handleFormChange(
                                                                    "customer_name",
                                                                    e.target.value
                                                                )
                                                        }
                                                        placeholder="Select or type customer"
                                                    />


                                                ) : col.key ===
                                                "record_date" ? (


                                                    /* DATE */

                                                    <input
                                                        type="date"
                                                        value={
                                                            form.record_date
                                                        }
                                                        readOnly
                                                        className="readonly-input"
                                                    />


                                                ) : col.key ===
                                                "record_time" ? (


                                                    /* TIME */

                                                    <input
                                                        type="time"
                                                        value={
                                                            form.record_time.slice(
                                                                0,
                                                                5
                                                            )
                                                        }
                                                        readOnly
                                                        className="readonly-input"
                                                    />


                                                ) : (


                                                    /* OTHER FIELDS */

                                                    <input
                                                        type={
                                                            col.inputType ||
                                                            "text"
                                                        }
                                                        value={
                                                            form[
                                                                col.key
                                                            ] ?? ""
                                                        }
                                                        onChange={
                                                            (e) =>
                                                                handleFormChange(
                                                                    col.key,
                                                                    e.target.value
                                                                )
                                                        }
                                                        placeholder={
                                                            col.label
                                                        }
                                                    />

                                                )}

                                            </td>

                                        )
                                    )}

                                </tr>

                            </tbody>

                        </table>

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
                        of Heading, Customer Name or
                        UID.
                    </p>


                    <form
                        className="search-grid"
                        onSubmit={handleSearch}
                    >


                        {/* HEADING */}

                        <label htmlFor="search-heading">
                            Heading
                        </label>

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


                        {/* CUSTOMER */}

                        <label htmlFor="search-customer">
                            Customer Name
                        </label>

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


                        {/* UID */}

                        <label htmlFor="search-uid">
                            UID
                        </label>

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
                                rows={
                                    searchResults
                                }
                            />

                        </div>

                    )}

                </section>


                {/* =================================================
                    ALL RECORDS
                ================================================= */}

                <section className="panel">

                    <h2>
                        All Records
                    </h2>


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
                                : "Show All Records"}

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
                            rows={
                                allRecords
                            }
                        />

                    )}

                </section>

            </main>

        </div>
    );
}