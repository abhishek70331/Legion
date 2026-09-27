import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

export const getAllRecords = async () => {
    const response = await axios.get(`${API_URL}/data`);
    return response.data;
};

export const createRecord = async (data) => {
    const response = await axios.post(
        `${API_URL}/data`,
        data
    );

    return response.data;
};

export const searchRecords = async ({
    heading,
    customer_name,
    uid
}) => {

    const response = await axios.get(
        `${API_URL}/data/search`,
        {
            params: {
                heading,
                customer_name,
                uid
            }
        }
    );

    return response.data;
};

export const getErrorMessage = (
    error,
    fallback = "Something went wrong."
) => {
    return (
        error?.response?.data?.message ||
        error?.message ||
        fallback
    );
};