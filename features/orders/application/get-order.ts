import "server-only";

import {
  findOrderById,
  listOrderEvents,
} from "@/features/orders/infrastructure/order.repository";

export {
  findOrderById as getOrderById,
  listOrderEvents as getOrderEvents,
};
