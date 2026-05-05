import "server-only";

import { findCustomerById } from "@/features/customers/infrastructure/customer.repository";

export { findCustomerById as getCustomerById };
