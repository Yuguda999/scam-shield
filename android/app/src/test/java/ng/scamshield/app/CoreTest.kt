package ng.scamshield.app

import ng.scamshield.app.core.DeviceStatus
import ng.scamshield.app.core.RedactionKind
import ng.scamshield.app.core.Verdict
import ng.scamshield.app.core.fingerprint
import ng.scamshield.app.core.isoWeek
import ng.scamshield.app.core.normalizeForFingerprint
import ng.scamshield.app.core.parseCheckResult
import ng.scamshield.app.core.redact
import ng.scamshield.app.core.route
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

/** Same cases as the TypeScript tests, so both platforms behave identically. */
class CoreTest {
    @Test fun phonesInAllFormatsShareOnePlaceholder() {
        val r = redact("Call 08031234567 or +234 803 123 4567 or 2348031234567 now")
        assertFalse(r.text.contains("803"))
        assertEquals(1, r.redactions.count { it.kind == RedactionKind.PHONE })
    }

    @Test fun accountAndBvnRedactedAmountsKept() {
        val r = redact("Send ₦50,000 to 0123456789 (GTBank). Your BVN 22123456789 is blocked.")
        assertTrue(r.text.contains("₦50,000"))
        assertTrue(r.text.contains("[ACCOUNT_NUMBER_1]"))
        assertTrue(r.text.contains("[BVN_OR_NIN_1]"))
    }

    @Test fun otpKeepsSignalWord() =
        assertEquals("Your OTP is [OTP_1], share it with our agent", redact("Your OTP is 482913, share it with our agent").text)

    @Test fun urlKeepsDomainDropsPath() {
        val r = redact("Verify at https://gtb-secure-update.com/login?id=88123&t=abc today")
        assertTrue(r.text.contains("https://gtb-secure-update.com/[URL_DETAILS_1]"))
        assertFalse(r.text.contains("88123"))
    }

    @Test fun namesByHeuristic() {
        assertEquals("Hi, this is [NAME_1] from HR at Dangote Group.", redact("Hi, this is Tunde from HR at Dangote Group.").text)
        assertEquals("Dear Customer, your account is blocked", redact("Dear Customer, your account is blocked").text)
        assertEquals("Desc: TRF FROM [NAME_1]. Avail Bal", redact("Desc: TRF FROM CHIOMA OKAFOR. Avail Bal").text)
    }

    @Test fun neverSendsRawTextToCloud() {
        for (d in DeviceStatus.entries) for (len in listOf(10, 99_999)) for (deep in listOf(false, true)) {
            val r = route(len, d, 3000, deep)
            if (!r.onDevice) assertTrue(r.redact)
        }
        assertTrue(route(100, DeviceStatus.AVAILABLE, 3000).onDevice)
    }

    @Test fun parsesFencedJsonAndClamps() {
        val r = parseCheckResult("```json\n{\"verdict\":\"safe\",\"risk\":180,\"scamType\":\"bogus\",\"summary\":\"\",\"redFlags\":\"x\",\"advice\":[1,\"\"]}\n```")
        assertEquals(100, r.risk)
        assertEquals(Verdict.suspicious, r.verdict)
        assertEquals("other", r.scamType)
    }

    @Test fun communityKeysMatchWeb() {
        assertEquals("2026-W47", isoWeek(LocalDate.parse("2026-11-22")))
        assertEquals("2026-W53", isoWeek(LocalDate.parse("2027-01-01")))
        val a = "Dear [NAME_1], send ₦15,000 to [ACCOUNT_NUMBER_1] for training. Call [PHONE_1]!"
        assertEquals("dear send to for training call", normalizeForFingerprint(a))
        assertEquals(64, fingerprint(a).length)
    }
}
