import axios from 'axios'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { getApiUrl } from '../config'

const http = axios.create({ baseURL: getApiUrl(), timeout: 20000 })

// Token Bearer sur chaque requête
http.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

http.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      AsyncStorage.multiRemove(['token', 'user'])
    }
    return Promise.reject(err)
  },
)

export default http
