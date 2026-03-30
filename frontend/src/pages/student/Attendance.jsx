import { useState, useEffect } from 'react'
import StudentLayout from '../../layouts/StudentLayout'
import api from '../../utils/api'

const StudentAttendance = () => {
  const [attendance, setAttendance] = useState([])
  const [summary, setSummary] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchAttendance() }, [])

  const fetchAttendance = async () => {
    try {
      const res = await api.get('/attendance/my')
      setAttendance(res.data.attendance)
      setSummary(res.data.summary)
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <StudentLayout>
      <div className="p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-800">My Attendance</h1>
          <p className="text-gray-500 text-sm mt-1">Track your attendance across all subjects</p>
        </div>

        {loading ? (
          <div className="text-center text-gray-500 py-8">Loading...</div>
        ) : (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              {summary.map((item, index) => (
                <div key={index} className="bg-white rounded-2xl shadow-sm p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="font-semibold text-gray-800">{item.subject}</h3>
                      <p className="text-xs text-gray-500">{item.code}</p>
                    </div>
                    <span className={`text-2xl font-bold ${
                      parseFloat(item.percentage) >= 75 ? 'text-green-600' :
                      parseFloat(item.percentage) >= 50 ? 'text-orange-500' :
                      'text-red-600'}`}>
                      {item.percentage}
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${
                        parseFloat(item.percentage) >= 75 ? 'bg-green-500' :
                        parseFloat(item.percentage) >= 50 ? 'bg-orange-500' :
                        'bg-red-500'}`}
                      style={{ width: item.percentage }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    {item.present} present out of {item.total} classes
                  </p>
                  {parseFloat(item.percentage) < 75 && (
                    <p className="text-xs text-red-500 mt-1">⚠️ Below 75% attendance!</p>
                  )}
                </div>
              ))}
              {summary.length === 0 && (
                <div className="col-span-3 text-center py-12 text-gray-400">
                  No attendance records yet
                </div>
              )}
            </div>

            {/* Detailed Records */}
            {attendance.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <div className="p-6 border-b">
                  <h2 className="text-lg font-semibold text-gray-800">Detailed Records</h2>
                </div>
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr className="text-left text-sm text-gray-500">
                      <th className="px-6 py-4">Subject</th>
                      <th className="px-6 py-4">Date</th>
                      <th className="px-6 py-4">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attendance.map((record) => (
                      <tr key={record.id} className="border-t hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <p className="font-medium text-gray-800 text-sm">{record.subject?.name}</p>
                          <p className="text-xs text-gray-500">{record.subject?.code}</p>
                        </td>
                        <td className="px-6 py-4 text-gray-500 text-sm">
                          {new Date(record.date).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`text-xs px-2 py-1 rounded-full font-medium
                            ${record.status === 'PRESENT' ? 'bg-green-100 text-green-700' :
                              record.status === 'ABSENT' ? 'bg-red-100 text-red-700' :
                              'bg-orange-100 text-orange-700'}`}>
                            {record.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </StudentLayout>
  )
}

export default StudentAttendance