import { useState, useEffect } from 'react'
import StudentLayout from '../../layouts/StudentLayout'
import api from '../../utils/api'
import logger from '../../utils/logger'
const StudentMarks = () => {
  const [marks, setMarks] = useState([])
  const [summary, setSummary] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchMarks() }, [])

  const fetchMarks = async () => {
    try {
      const res = await api.get('/marks/my')
      setMarks(res.data.marks)
      setSummary(res.data.summary)
    } catch (error) {
      logger.error(error)
    } finally {
      setLoading(false)
    }
  }

  const examTypeColors = {
    INTERNAL: 'bg-blue-100 text-blue-700',
    MIDTERM: 'bg-purple-100 text-purple-700',
    FINAL: 'bg-red-100 text-red-700',
    PRACTICAL: 'bg-green-100 text-green-700',
  }

  return (
    <StudentLayout>
      <div className="p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-800">My Marks</h1>
          <p className="text-gray-500 text-sm mt-1">View your exam results</p>
        </div>

        {loading ? (
          <div className="text-center text-gray-500 py-8">Loading...</div>
        ) : (
          <>
            {/* Summary by Subject */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              {summary.map((item, index) => (
                <div key={index} className="bg-white rounded-2xl shadow-sm p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="font-semibold text-gray-800">{item.subject}</h3>
                      <p className="text-xs text-gray-500">{item.code}</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {item.exams.map((exam, i) => (
                      <div key={i} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${examTypeColors[exam.examType]}`}>
                          {exam.examType}
                        </span>
                        <div className="text-right">
                          <span className={`font-bold text-sm ${
                            parseFloat(exam.percentage) >= 70 ? 'text-green-600' :
                            parseFloat(exam.percentage) >= 40 ? 'text-orange-500' :
                            'text-red-600'}`}>
                            {exam.obtained}/{exam.total}
                          </span>
                          <span className="text-xs text-gray-500 ml-2">({exam.percentage})</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {summary.length === 0 && (
                <div className="col-span-2 text-center py-12 text-gray-400">
                  No marks added yet
                </div>
              )}
            </div>

            {/* Detailed Marks Table */}
            {marks.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <div className="p-6 border-b">
                  <h2 className="text-lg font-semibold text-gray-800">All Results</h2>
                </div>
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr className="text-left text-sm text-gray-500">
                      <th className="px-6 py-4">Subject</th>
                      <th className="px-6 py-4">Exam Type</th>
                      <th className="px-6 py-4">Obtained</th>
                      <th className="px-6 py-4">Total</th>
                      <th className="px-6 py-4">Percentage</th>
                      <th className="px-6 py-4">Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {marks.map((mark) => (
                      <tr key={mark.id} className="border-t hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <p className="font-medium text-gray-800 text-sm">{mark.subject?.name}</p>
                          <p className="text-xs text-gray-500">{mark.subject?.code}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${examTypeColors[mark.examType]}`}>
                            {mark.examType}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-medium text-gray-800">{mark.obtainedMarks}</td>
                        <td className="px-6 py-4 text-gray-500">{mark.totalMarks}</td>
                        <td className="px-6 py-4">
                          <span className={`font-medium ${
                            (mark.obtainedMarks / mark.totalMarks) >= 0.7 ? 'text-green-600' :
                            (mark.obtainedMarks / mark.totalMarks) >= 0.4 ? 'text-orange-500' :
                            'text-red-600'}`}>
                            {((mark.obtainedMarks / mark.totalMarks) * 100).toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-6 py-4 text-gray-500 text-sm">{mark.remarks || '-'}</td>
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

export default StudentMarks


