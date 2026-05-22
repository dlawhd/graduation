package shop.esjh.memoryjar.enums.jar;

public enum JarRole {
    OWNER,  // 저금통 주인
    ADMIN,  // 관리자
    MEMBER; // 일반 멤버

    public boolean isOwner() {
        return this == OWNER;
    }

    public boolean isAdminOrOwner() {
        return this == OWNER || this == ADMIN;
    }
}