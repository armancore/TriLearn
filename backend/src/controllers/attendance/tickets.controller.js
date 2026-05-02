const { createController } = require('../../utils/controllerAdapter')
const {
  getMyAbsenceTickets: getMyAbsenceTicketsService,
  createAbsenceTicket: createAbsenceTicketService,
  getAbsenceTicketsForStaff: getAbsenceTicketsForStaffService,
  reviewAbsenceTicket: reviewAbsenceTicketService
} = require('../../services/attendance/tickets.service')

const getMyAbsenceTickets = createController(getMyAbsenceTicketsService)
const createAbsenceTicket = createController(createAbsenceTicketService)
const getAbsenceTicketsForStaff = createController(getAbsenceTicketsForStaffService)
const reviewAbsenceTicket = createController(reviewAbsenceTicketService)

module.exports = {
  getMyAbsenceTickets: getMyAbsenceTickets,
  createAbsenceTicket: createAbsenceTicket,
  getAbsenceTicketsForStaff: getAbsenceTicketsForStaff,
  reviewAbsenceTicket: reviewAbsenceTicket
}
