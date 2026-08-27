import axios from 'axios'

// Local / Docker: VITE_API_URL is unset → requests go to /api on the same server
// Vercel + Railway: set VITE_API_URL=https://your-backend.up.railway.app
const BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api'

const api = axios.create({
  baseURL: BASE,
  headers: { 'Content-Type': 'application/json' },
})

export async function calculateFundedRatio(planInput) {
  const { data } = await api.post('/calculate', planInput)
  return data
}

export async function importMgpXml(file) {
  const formData = new FormData()
  formData.append('file', file)
  const { data } = await api.post('/import-xml', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export async function downloadReport(planInput) {
  const response = await api.post('/report', planInput, { responseType: 'blob' })
  const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }))
  const link = document.createElement('a')
  link.href = url
  const disposition = response.headers['content-disposition'] || ''
  const match = disposition.match(/filename="(.+)"/)
  link.setAttribute('download', match ? match[1] : 'RCA_Report.pdf')
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}

export default api
