package com.betterdeepseek.app

import android.widget.FrameLayout
import androidx.core.graphics.Insets
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30])
class KeyboardInsetTest {

    private lateinit var rootLayout: FrameLayout

    @Before
    fun setUp() {
        rootLayout = FrameLayout(RuntimeEnvironment.getApplication())
        ViewCompat.setOnApplyWindowInsetsListener(rootLayout, ::applyRootWindowInsets)
    }

    @Test
    fun `translation is zero when no keyboard is open`() {
        val insets = WindowInsetsCompat.Builder()
            .setInsets(WindowInsetsCompat.Type.systemBars(), Insets.of(16, 48, 16, 48))
            .setInsets(WindowInsetsCompat.Type.ime(), Insets.of(0, 0, 0, 0))
            .build()

        ViewCompat.dispatchApplyWindowInsets(rootLayout, insets)

        assertEquals(0f, rootLayout.translationY, 0f)
    }

    @Test
    fun `view is pushed up by keyboard height`() {
        val keyboardHeight = 840
        val insets = WindowInsetsCompat.Builder()
            .setInsets(WindowInsetsCompat.Type.systemBars(), Insets.of(16, 48, 16, 48))
            .setInsets(WindowInsetsCompat.Type.ime(), Insets.of(0, 0, 0, keyboardHeight))
            .build()

        ViewCompat.dispatchApplyWindowInsets(rootLayout, insets)

        assertEquals(-keyboardHeight.toFloat(), rootLayout.translationY, 0f)
    }

    @Test
    fun `transition from no keyboard to keyboard updates translation`() {
        val noKeyboard = WindowInsetsCompat.Builder()
            .setInsets(WindowInsetsCompat.Type.systemBars(), Insets.of(16, 48, 16, 48))
            .setInsets(WindowInsetsCompat.Type.ime(), Insets.of(0, 0, 0, 0))
            .build()

        ViewCompat.dispatchApplyWindowInsets(rootLayout, noKeyboard)
        assertEquals(0f, rootLayout.translationY, 0f)

        val withKeyboard = WindowInsetsCompat.Builder()
            .setInsets(WindowInsetsCompat.Type.systemBars(), Insets.of(16, 48, 16, 48))
            .setInsets(WindowInsetsCompat.Type.ime(), Insets.of(0, 0, 0, 840))
            .build()

        ViewCompat.dispatchApplyWindowInsets(rootLayout, withKeyboard)
        assertEquals(-840f, rootLayout.translationY, 0f)
    }

    @Test
    fun `system bar insets are applied as padding`() {
        val insets = WindowInsetsCompat.Builder()
            .setInsets(WindowInsetsCompat.Type.systemBars(), Insets.of(24, 56, 24, 56))
            .setInsets(WindowInsetsCompat.Type.ime(), Insets.of(0, 0, 0, 0))
            .build()

        ViewCompat.dispatchApplyWindowInsets(rootLayout, insets)

        assertEquals(24, rootLayout.paddingLeft)
        assertEquals(56, rootLayout.paddingTop)
        assertEquals(24, rootLayout.paddingRight)
        assertEquals(56, rootLayout.paddingBottom)
    }
}
