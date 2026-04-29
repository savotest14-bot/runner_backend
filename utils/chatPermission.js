exports.canDirectChat = (sender, receiver) => {
  const sRole = sender.role.name;
  const rRole = receiver.role;

  const sIsGA = sender.isGroupAdmin || false;
  const rIsGA = receiver.isGroupAdmin || false;

  /* ================= SUPER ADMIN ================= */
  if (sRole === "superAdmin" || rRole === "superAdmin") {
    return true;
  }

  /* ================= EMPLOYEE ================= */

  // employee ↔ employee
  if (sRole === "employee" && rRole === "employee") {
    return true;
  }

  // employee → group_admin
  if (
    sRole === "employee" &&
    rRole === "employee" &&
    rIsGA
  ) {
    return true;
  }

  /* ================= GROUP ADMIN ================= */

  // group_admin → admin
  if (
    sRole === "employee" &&
    sIsGA &&
    ["company_admin", "finance_manager"].includes(rRole)
  ) {
    return true;
  }

  /* ================= ADMIN ================= */

  // company_admin ↔ finance_manager
  if (
    ["company_admin", "finance_manager"].includes(sRole) &&
    ["company_admin", "finance_manager"].includes(rRole)
  ) {
    return true;
  }

  return false;
};