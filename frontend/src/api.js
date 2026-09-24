import axios from 'axios';
export const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1', withCredentials: true });
export async function loadBooks(params) { return (await api.get('/books', { params })).data.data; }
export async function loadBook(id) { return (await api.get(`/books/${id}`)).data.data; }
export async function loadCategories() { return (await api.get('/categories')).data.data.categories; }
