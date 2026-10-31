export function websiteLeadSmsBody(businessName: string, project: string) {
  const company = businessName.trim().slice(0, 25) || "Our team";
  const request = project.trim().slice(0, 30) || "remodeling";
  return `${company}: We received your ${request} estimate request. We will follow up soon. Reply STOP to unsubscribe; HELP for help.`;
}
