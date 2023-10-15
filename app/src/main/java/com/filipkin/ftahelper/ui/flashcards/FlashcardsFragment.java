package com.filipkin.ftahelper.ui.flashcards;

import android.content.SharedPreferences;
import android.os.Bundle;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.fragment.app.Fragment;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;

import com.filipkin.ftahelper.R;
import com.filipkin.ftahelper.databinding.FragmentFlashcardsBinding;
import com.google.android.material.button.MaterialButton;
import com.google.android.material.color.MaterialColors;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

public class FlashcardsFragment extends Fragment {

    private FragmentFlashcardsBinding binding;
    private boolean editing = false;
    private View root;
    private SharedPreferences flashcardPrefs;
    private Set<String> flashcards;

    LinearLayout layout;

    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        binding = FragmentFlashcardsBinding.inflate(inflater, container, false);
        root = binding.getRoot();

        layout = binding.flashcardButtons;

        binding.flashcardDisplay.setOnClickListener(c -> {
            binding.flashcardDisplay.setVisibility(View.GONE);
            binding.flashcardsInterface.setVisibility(View.VISIBLE);
        });

        // TODO: Create a way to add and remove your own flashcards
        flashcardPrefs = requireContext().getSharedPreferences("flashcards", 0);
        flashcards = new HashSet<>(flashcardPrefs.getStringSet("flashcards", new HashSet<>(Arrays.asList(root.getResources().getStringArray(R.array.default_flashcards)))));


        for (String flashcard : flashcards) {
            createFlashcardButton(flashcard);
        }

        binding.newFlashcardAdd.setOnClickListener(c -> {
            String flashcard = String.valueOf(binding.newFlashcardText.getText());
            flashcards.add(flashcard);
            flashcardPrefs.edit().putStringSet("flashcards", flashcards).apply();

            createFlashcardButton(flashcard);
        });

        binding.addOrRemove.setOnClickListener(c -> {
            editing = !editing;
            if (editing) {
                binding.addOrRemove.setText(R.string.finish_editing);
                binding.addContainer.setVisibility(View.VISIBLE);
            } else {
                binding.addOrRemove.setText(R.string.add_or_remove_flashcards);
                binding.addContainer.setVisibility(View.GONE);
            }

            for (int i = 0; i < layout.getChildCount(); i++) {
                View btn = layout.getChildAt(i);
                if (editing ) {
                    btn.setBackgroundColor(getResources().getColor(R.color.red_600, root.getContext().getTheme()));
                } else {
                    btn.setBackgroundColor(MaterialColors.getColor(root, com.google.android.material.R.attr.colorPrimary));
                }
            }
        });

        return root;
    }

    private void createFlashcardButton(String flashcard) {
        Button btnTag = new MaterialButton(root.getContext());
        btnTag.setLayoutParams(new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        btnTag.setTextSize(18);
        btnTag.setText(flashcard);
        if (editing) btnTag.setBackgroundColor(getResources().getColor(R.color.red_600, root.getContext().getTheme()));

        btnTag.setOnClickListener(c -> {
            if (editing) {
                flashcards.remove(flashcard);
                flashcardPrefs.edit().putStringSet("flashcards", flashcards).apply();
                layout.removeView(btnTag);
            } else {
                binding.flashcardsInterface.setVisibility(View.GONE);
                binding.flashcardDisplay.setVisibility(View.VISIBLE);
                binding.flashcardText.setText(flashcard);
            }
        });

        layout.addView(btnTag);
    }
}