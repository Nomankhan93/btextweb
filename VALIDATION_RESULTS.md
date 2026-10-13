# Validation — Web 0.20.2

Web 0.20.2 preserves the certified 0.20.1 install/update baseline and adds focused landing conversion/mobile UX gates.

Automated certification is consolidated under `npm run certify:0202` and should be run in WSL on Node `24.21.0` before release packaging. The dedicated tests protect hero/product hierarchy, accessible mobile navigation, Install App continuity, FAQ semantics, three-point comparison scope and the existing public-root/PWA contracts.

Deployment smoke should verify 320/360/390/412px-class mobile widths, no horizontal overflow, significantly earlier product proof, readable Android-section contrast, and unchanged signup/sign-in/install/update behavior.
