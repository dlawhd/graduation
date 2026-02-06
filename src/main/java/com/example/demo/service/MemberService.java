package com.example.demo.service;

import com.example.demo.entity.Member;
import com.example.demo.repository.MemberRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class MemberService {

    private final MemberRepository memberRepository;

    public MemberService(MemberRepository memberRepository) {
        this.memberRepository = memberRepository;
    }

    @Transactional
    public Member findOrCreateNaverMember(String providerId, String email, String name, String birthyear) {
        String provider = "NAVER";

        Member member = memberRepository.findByProviderAndProviderId(provider, providerId)
                .orElseGet(() -> Member.builder()
                        .provider(provider)
                        .providerId(providerId)
                        .email(email)
                        .name(name)
                        .birthyear(birthyear)
                        .build());

        // 로그인할 때마다 최신 프로필로 갱신(선택)
        member.updateProfile(email, name, birthyear);

        return memberRepository.save(member);
    }
}