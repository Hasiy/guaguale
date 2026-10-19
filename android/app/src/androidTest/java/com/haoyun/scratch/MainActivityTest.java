/* Copyright (c) 2026 Lucky Scratch contributors. */
package com.haoyun.scratch;

import static androidx.test.espresso.Espresso.onView;
import static androidx.test.espresso.assertion.ViewAssertions.matches;
import static androidx.test.espresso.matcher.ViewMatchers.isAssignableFrom;
import static androidx.test.espresso.matcher.ViewMatchers.isDisplayed;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.os.SystemClock;
import android.view.View;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.InputDevice;
import android.view.ViewGroup;
import android.webkit.WebView;

import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/** Integration coverage against the actual bundled HTML and native WebView storage. */
@RunWith(AndroidJUnit4.class)
public final class MainActivityTest {
    private static final long PAGE_TIMEOUT_MS = 60_000;
    private static final long SCRIPT_TIMEOUT_SECONDS = 20;
    private static final int TOUCH_STEPS_PER_ROW = 12;
    private static final long TOUCH_STEP_MS = 12;
    private static final String SNAPSHOT = "(() => {"
            + "const s=JSON.parse(localStorage.getItem('scratch-account-v1'));"
            + "return {balance:s.account.balance,id:s.account.id,serial:s.session.serial,"
            + "paid:s.session.paid,credited:s.session.credited,mode:s.session.card.mode,"
            + "revealed:s.session.revealed.length,count:s.session.card.cells.length,"
            + "charges:s.account.history.filter(h=>h.serial===s.session.serial&&h.change<0).length};"
            + "})()";

    @Test
    public void webView_revealAndReopen_preservesBalanceAndTicket() throws Exception {
        JSONObject completed;
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            WebView view = awaitPage(scenario);
            onView(isAssignableFrom(WebView.class)).check(matches(isDisplayed()));
            assertEquals("true", evaluate(view, "document.body.dataset.page==='catalog'"
                    + " && getComputedStyle(document.querySelector('#ticket-page')).display==='none'"));
            assertEquals("true", evaluate(view,
                    "location.origin==='https://appassets.androidplatform.net'"));
            assertEquals("true", evaluate(view,
                    "document.documentElement.scrollWidth<=innerWidth"));
            JSONObject before = snapshot(view);
            assertTrue("Run on a test device with an unpaid or completed ticket",
                    !before.getBoolean("paid") || before.getInt("revealed") == before.getInt("count"));
            int balance = before.getInt("balance");
            assertTrue("Test account needs at least 20 virtual points", balance >= 20);

            evaluate(view, "document.querySelector('[data-game=hundred20]').click();"
                    + "document.querySelector('#new-card').click(); true");
            JSONObject fresh = snapshot(view);
            assertEquals("true", evaluate(view, "document.body.dataset.page==='ticket'"
                    + " && getComputedStyle(document.querySelector('#catalog-page')).display==='none'"));
            assertEquals("hundred20", fresh.getString("mode"));
            assertEquals(21, fresh.getInt("count"));
            assertEquals(balance, fresh.getInt("balance"));

            revealNext(view);
            JSONObject first = snapshot(view);
            assertTrue("First reveal must pay for the card", first.getBoolean("paid"));
            assertEquals(1, first.getInt("charges"));
            assertEquals(1, first.getInt("revealed"));
            assertEquals(balance - 20 + first.getInt("credited"), first.getInt("balance"));

            evaluate(view, "document.querySelector('#back-to-catalog').click(); true");
            awaitRoute(view, "catalog");
            assertEquals("false", evaluate(view, "document.querySelector('#resume-ticket').hidden"));
            assertSameSession(first, snapshot(view));
            evaluate(view, "document.querySelector('#resume-ticket').click(); true");
            awaitRoute(view, "ticket");
            InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);
            awaitRoute(view, "catalog");
            assertSameSession(first, snapshot(view));
            evaluate(view, "document.querySelector('#resume-ticket').click(); true");
            awaitRoute(view, "ticket");

            // A newly created Activity must restore a partially revealed card without charging again.
            scenario.recreate();
            view = awaitPage(scenario);
            assertSameSession(first, snapshot(view));
            evaluate(view, "document.querySelector('#resume-ticket').click(); true");
            revealNext(view);
            JSONObject second = snapshot(view);
            assertEquals(1, second.getInt("charges"));
            assertEquals(2, second.getInt("revealed"));
            assertEquals(balance - 20 + second.getInt("credited"), second.getInt("balance"));

            evaluate(view, "document.querySelector('#reveal-all').click(); true");
            completed = snapshot(view);
            assertEquals(21, completed.getInt("revealed"));
            assertEquals(1, completed.getInt("charges"));
            assertEquals(balance - 20 + completed.getInt("credited"), completed.getInt("balance"));
            evaluate(view, "document.querySelector('#reveal-all').click(); true");
            assertSameSession(completed, snapshot(view));
        }
        try (ActivityScenario<MainActivity> reopened = ActivityScenario.launch(MainActivity.class)) {
            assertSameSession(completed, snapshot(awaitPage(reopened)));
        }
    }

    @Test
    public void webView_singleTouchAcrossCells_revealsMultipleAndChargesOnce() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            WebView view = awaitPage(scenario);
            JSONObject before = snapshot(view);
            assertTrue("Run on a test account with no incomplete paid ticket",
                    !before.getBoolean("paid") || before.getInt("revealed") == before.getInt("count"));
            int balance = before.getInt("balance");
            assertTrue("Test account needs at least 10 virtual points", balance >= 10);
            evaluate(view, "document.querySelector('[data-game=shun10]').click();"
                    + "document.querySelector('#new-card').click();"
                    + "window.scrollTo(0,scrollY+document.querySelector('#scratch-grid canvas').getBoundingClientRect().top-100); true");
            JSONObject bounds = new JSONObject(evaluate(view, "(() => {"
                    + "const cells=document.querySelectorAll('#scratch-grid canvas');"
                    + "const a=cells[0].getBoundingClientRect(),b=cells[2].getBoundingClientRect();"
                    + "return {left:a.left+a.width*.1,right:b.right-b.width*.1,top:a.top,height:a.height,width:innerWidth};"
                    + "})()"));
            int[] origin = new int[2];
            AtomicReference<Float> scale = new AtomicReference<>();
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
                view.getLocationOnScreen(origin);
                scale.set(view.getWidth() / (float) bounds.optDouble("width"));
            });
            float left = origin[0] + (float) bounds.getDouble("left") * scale.get();
            float right = origin[0] + (float) bounds.getDouble("right") * scale.get();
            float top = origin[1] + (float) bounds.getDouble("top") * scale.get();
            float height = (float) bounds.getDouble("height") * scale.get();
            // One uninterrupted touch, including after the first canvas removes itself on reveal.
            long downTime = SystemClock.uptimeMillis();
            sendTouch(downTime, MotionEvent.ACTION_DOWN, left, top + height * .15f);
            for (int row = 0; row < 4; row++) {
                float y = top + height * (.15f + row * .23f);
                for (int step = 0; step <= TOUCH_STEPS_PER_ROW; step++) {
                    float fraction = step / (float) TOUCH_STEPS_PER_ROW;
                    float x = row % 2 == 0 ? left + (right - left) * fraction : right - (right - left) * fraction;
                    sendTouch(downTime, MotionEvent.ACTION_MOVE, x, y);
                }
            }
            sendTouch(downTime, MotionEvent.ACTION_UP, left, top + height * .84f);
            InstrumentationRegistry.getInstrumentation().waitForIdleSync();
            JSONObject scratched = snapshot(view);
            assertTrue("A single touch must reveal multiple neighboring cells", scratched.getInt("revealed") >= 3);
            assertEquals(1, scratched.getInt("charges"));
            assertEquals(balance - 10 + scratched.getInt("credited"), scratched.getInt("balance"));
            // Finish this test ticket so other integration tests can run without discarding progress.
            evaluate(view, "document.querySelector('#reveal-all').click(); true");
        }
    }

    /** Inject a touchscreen sample in screen pixels; all samples share a single down time. */
    private void sendTouch(long downTime, int action, float x, float y) {
        MotionEvent event = MotionEvent.obtain(downTime, SystemClock.uptimeMillis(), action, x, y, 0);
        event.setSource(InputDevice.SOURCE_TOUCHSCREEN);
        try {
            InstrumentationRegistry.getInstrumentation().sendPointerSync(event);
        } finally {
            event.recycle();
        }
        SystemClock.sleep(TOUCH_STEP_MS);
    }

    /** Dispatch the same keyboard reveal event supported by the accessible scratch surface. */
    private void revealNext(WebView view) throws Exception {
        evaluate(view, "document.querySelector('#scratch-grid canvas').dispatchEvent("
                + "new KeyboardEvent('keydown',{key:'Enter',bubbles:true})); true");
    }

    @Test
    public void settings_saveAndReopen_appliesOnlyToNewTickets() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            WebView view = awaitPage(scenario);
            JSONObject before = snapshot(view);
            String originalRate = evaluate(view, "JSON.parse(localStorage.getItem('scratch-settings-v1')||'{\"winRate\":0.1}').winRate");
            evaluate(view, "document.querySelector('#open-settings').click(); true");
            awaitRoute(view, "settings");
            assertEquals("true", evaluate(view, "getComputedStyle(document.querySelector('#catalog-page')).display==='none'"
                    + " && getComputedStyle(document.querySelector('#ticket-page')).display==='none'"));
            evaluate(view, "document.querySelector('#probability-number').value='100';"
                    + "document.querySelector('#probability-form').requestSubmit(); true");
            assertEquals("1", evaluate(view, "JSON.parse(localStorage.getItem('scratch-settings-v1')).winRate"));
            assertSameSession(before, snapshot(view));
            evaluate(view, "document.querySelector('#probability-number').value='101';"
                    + "document.querySelector('#probability-form').requestSubmit(); true");
            assertEquals("1", evaluate(view, "JSON.parse(localStorage.getItem('scratch-settings-v1')).winRate"));
            evaluate(view, "document.querySelector('#probability-number').value='100'; document.activeElement.blur(); true");
            InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);
            awaitRoute(view, "catalog");
            scenario.recreate();
            view = awaitPage(scenario);
            evaluate(view, "document.querySelector('#open-settings').click(); true");
            assertEquals("true", evaluate(view, "document.querySelector('#probability-number').value==='100'"));
            evaluate(view, "document.querySelector('#back-from-settings').click(); true");
            awaitRoute(view, "catalog");
            assertSameSession(before, snapshot(view));
            assertTrue("Run settings integration on an unpaid or completed test ticket",
                    !before.getBoolean("paid") || before.getInt("revealed") == before.getInt("count"));
            evaluate(view, "document.querySelector('[data-game=hundred20]').click();"
                    + "document.querySelector('#new-card').click(); true");
            assertEquals("1", evaluate(view, "JSON.parse(localStorage.getItem('scratch-account-v1')).session.card.winRate"));
            // Restore the test setting through the same form; do not delete wallet data.
            evaluate(view, "history.replaceState(null,'','#settings'); window.dispatchEvent(new PopStateEvent('popstate'));"
                    + "document.querySelector('#probability-number').value=100*" + originalRate + ";"
                    + "document.querySelector('#probability-form').requestSubmit(); true");
            evaluate(view, "document.querySelector('#back-from-settings').click(); true");
            awaitRoute(view, "catalog");
        }
    }

    private JSONObject snapshot(WebView view) throws Exception {
        return new JSONObject(evaluate(view, SNAPSHOT));
    }

    private void awaitRoute(WebView view, String page) throws Exception {
        long deadline = SystemClock.elapsedRealtime() + PAGE_TIMEOUT_MS;
        do {
            if ("true".equals(evaluate(view, "document.body.dataset.page==='" + page + "'"))) return;
            SystemClock.sleep(100);
        } while (SystemClock.elapsedRealtime() < deadline);
        throw new AssertionError("Page navigation timed out");
    }

    private void assertSameSession(JSONObject expected, JSONObject actual) throws Exception {
        assertEquals(expected.getInt("balance"), actual.getInt("balance"));
        assertEquals(expected.getInt("credited"), actual.getInt("credited"));
        assertEquals(expected.getInt("revealed"), actual.getInt("revealed"));
        assertEquals(expected.getInt("charges"), actual.getInt("charges"));
        assertTrue("Account must survive reopening", expected.getString("id").equals(actual.getString("id")));
        assertTrue("Ticket must survive reopening", expected.getString("serial").equals(actual.getString("serial")));
    }

    private WebView awaitPage(ActivityScenario<MainActivity> scenario) throws Exception {
        AtomicReference<WebView> reference = new AtomicReference<>();
        scenario.onActivity(activity -> reference.set(findWebView(activity.getWindow().getDecorView())));
        WebView view = reference.get();
        assertNotNull("Native WebView must be attached", view);
        long deadline = SystemClock.elapsedRealtime() + PAGE_TIMEOUT_MS;
        do {
            if ("true".equals(evaluate(view, "document.querySelectorAll('[data-game]').length===10"
                    + " && document.querySelectorAll('#scratch-grid .scratch-cell').length>0"
                    + " && !!localStorage.getItem('scratch-account-v1')"))) return view;
            SystemClock.sleep(250);
        } while (SystemClock.elapsedRealtime() < deadline);
        throw new AssertionError("Bundled game did not finish loading");
    }

    private WebView findWebView(View view) {
        if (view instanceof WebView) return (WebView) view;
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int index = 0; index < group.getChildCount(); index++) {
                WebView found = findWebView(group.getChildAt(index));
                if (found != null) return found;
            }
        }
        return null;
    }

    /** Execute a test-only DOM operation on the UI thread and await its WebView result. */
    private String evaluate(WebView view, String script) throws Exception {
        AtomicReference<String> result = new AtomicReference<>();
        CountDownLatch completed = new CountDownLatch(1);
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() ->
                view.evaluateJavascript(script, value -> {
                    result.set(value);
                    completed.countDown();
                }));
        assertTrue("WebView script callback timed out", completed.await(SCRIPT_TIMEOUT_SECONDS, TimeUnit.SECONDS));
        return result.get();
    }
}
